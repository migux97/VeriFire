// Server-side access to the Verifire product contract on Stellar testnet. Holds the admin key: never import it in the browser.
import 'dotenv/config';
import {
  Account, Address, BASE_FEE, Contract, Keypair, Networks, TransactionBuilder,
  hash, nativeToScVal, rpc, scValToNative, xdr
} from '@stellar/stellar-sdk';

// Must match ACTIVATION_DOMAIN in contracts/verifire_product/src/lib.rs and the derivation in app.js.
const ACTIVATION_DOMAIN = 'verifire-activation-v1';
export const networkPassphrase = Networks.TESTNET;
export const rpcServer = new rpc.Server(process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org');

const contractId = () => process.env.STELLAR_CONTRACT_ID || '';
// Issuing account (the "notary"): it only registers products and certifies warranties, and pays the network fees
// of those transactions. The company's money moves through a separate treasury account (COSMOS_PAY_DESTINATION),
// which never signs here, so a buyer reading a certificate cannot reach the company's finances.
// STELLAR_ADMIN_SECRET is the old name of the same key.
const issuerSecret = () => process.env.STELLAR_ISSUER_SECRET || process.env.STELLAR_ADMIN_SECRET || '';
let admin = null;
const adminKeypair = () => (admin ||= Keypair.fromSecret(issuerSecret()));

export const chainEnabled = () => Boolean(contractId() && issuerSecret());
export const isTxHash = (value) => /^[0-9a-f]{64}$/i.test(String(value || ''));
export const explorerTxUrl = (txHash) => `https://stellar.expert/explorer/testnet/tx/${txHash}`;

// ed25519 public key derived from the secret inside the package; only this key is registered on-chain.
export const activationKeyFor = (secret) => Buffer.from(Keypair.fromRawEd25519Seed(hash(Buffer.from(`${ACTIVATION_DOMAIN}:${secret}`, 'utf8'))).rawPublicKey());

const contractMessages = [
  [/product is already claimed/, 'Este producto ya fue reclamado en Stellar.'],
  [/product token does not exist|product code does not exist/, 'Este producto no está registrado en el contrato de Stellar.'],
  [/ed25519|signature|crypto/i, 'La firma del QR no corresponde a este producto.']
];

// Known contract panics become messages safe to show to the client (see sendError in server.mjs).
const contractError = (error) => {
  const message = String(error?.message || error || '');
  const match = contractMessages.find(([pattern]) => pattern.test(message));
  return match ? Object.assign(new Error(match[1]), { status: 409, expose: true }) : error instanceof Error ? error : new Error(message);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForTransaction = async (txHash) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await rpcServer.getTransaction(txHash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) return result;
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) throw new Error(`La transacción ${txHash} falló en Stellar.`);
    await sleep(1500);
  }
  throw new Error(`Stellar no confirmó la transacción ${txHash} a tiempo.`);
};

// Transactions signed by the same account go one at a time, so their sequence numbers never collide.
let submitQueue = Promise.resolve();

export const submitOperation = (keypair, operation) => {
  const run = submitQueue.then(async () => {
    const account = await rpcServer.getAccount(keypair.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase }).addOperation(operation).setTimeout(120).build();
    let prepared;
    try {
      prepared = await rpcServer.prepareTransaction(tx);
    } catch (error) {
      throw contractError(error);
    }
    prepared.sign(keypair);
    const sent = await rpcServer.sendTransaction(prepared);
    if (sent.status !== 'PENDING' && sent.status !== 'DUPLICATE') {
      throw new Error(`Stellar rechazó la transacción (${sent.status} ${sent.errorResult?.result().switch().name || ''}).`);
    }
    const result = await waitForTransaction(sent.hash);
    return { txHash: sent.hash, returnValue: result.returnValue ? scValToNative(result.returnValue) : undefined };
  });
  submitQueue = run.catch(() => {});
  return run;
};

const contract = () => new Contract(contractId());
const u64 = (value) => nativeToScVal(BigInt(value), { type: 'u64' });
const text = (value) => nativeToScVal(String(value), { type: 'string' });

// Read-only call: simulated, never submitted, so it needs no fee or sequence number.
const simulate = async (method, ...args) => {
  const source = new Account(adminKeypair().publicKey(), '0');
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase }).addOperation(contract().call(method, ...args)).setTimeout(30).build();
  const simulation = await rpcServer.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulation)) throw contractError(simulation.error);
  return scValToNative(simulation.result.retval);
};

export const mintOnChain = async (product) => {
  const { txHash, returnValue } = await submitOperation(adminKeypair(), contract().call(
    'mint_product',
    text(product.token), text(product.model), text(product.lot), text(product.destination),
    xdr.ScVal.scvBytes(activationKeyFor(product.secretCode))
  ));
  return { tokenId: Number(returnValue), mintTx: txHash };
};

export const readProduct = (tokenId) => simulate('get_product', u64(tokenId));

// Bytes the activation key signs in the browser. They bind this contract, the token and the claimant.
export const activationMessage = async (tokenId, claimant) => Buffer.from(await simulate('activation_message', u64(tokenId), Address.fromString(claimant).toScVal()));

// Existing account that receives the 1-stroop payment the Cavos kit makes when it creates a buyer's account.
export const adminAddress = () => adminKeypair().publicKey();

const accountExists = async (address) => {
  try {
    await rpcServer.getAccount(address);
    return true;
  } catch {
    return false;
  }
};

// Unsigned activation for the buyer's wallet. The buyer's account is the SOURCE of the transaction, so the
// contract's require_auth is satisfied by the envelope signature. A signature placed inside a Soroban auth entry
// would be lost instead: the Cavos kit signs entries on a decoded copy, and its SDK re-serializes the transaction
// from the original XDR, keeping only the envelope signatures.
// Simulating here also runs the contract's signature check, so a wrong QR fails before the buyer signs anything.
export const buildActivation = async ({ tokenId, claimant, signature }) => {
  // require_auth cannot authenticate an account that does not exist on-chain yet.
  if (!(await accountExists(claimant))) {
    throw Object.assign(new Error('Tu cuenta Stellar todavía no existe en la red. Volvé a intentar la activación.'), { status: 409, expose: true });
  }
  // The release wasm drops panic messages ("UnreachableCodeReached"), so the claimed state is read first.
  if ((await readProduct(tokenId)).claimed) {
    throw Object.assign(new Error('Este producto ya fue reclamado en Stellar.'), { status: 409, expose: true });
  }
  const account = await rpcServer.getAccount(claimant);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
    .addOperation(contract().call('activate_product', u64(tokenId), Address.fromString(claimant).toScVal(), xdr.ScVal.scvBytes(signature)))
    .setTimeout(300)
    .build();
  try {
    return (await rpcServer.prepareTransaction(tx)).toXDR();
  } catch (error) {
    throw contractError(error);
  }
};

const invalidActivation = () => Object.assign(new Error('La transacción firmada no corresponde a la activación de este producto.'), { status: 400, expose: true });

// Inclusion fee the issuing account pays per certification; the inner transaction's resource fee is added on top.
const FEE_BUMP_BASE_FEE = '2000';

// Submits the activation the buyer's wallet signed. The buyer's account is the source, so its envelope signature is
// what authorizes the contract call; the issuing account only pays, by wrapping the transaction in a fee bump, so a
// buyer holding no XLM can still certify. Returns the hash once the contract shows the new owner.
export const submitActivation = async ({ tokenId, claimant, signedXdr }) => {
  let tx;
  try {
    tx = TransactionBuilder.fromXDR(String(signedXdr), networkPassphrase);
  } catch {
    throw invalidActivation();
  }
  // SDK 17 exposes XDR unions as plain objects with a `type` tag and named fields.
  const [operation] = tx.operations || [];
  if (tx.operations?.length !== 1 || operation.type !== 'invokeHostFunction' || operation.func?.type !== 'hostFunctionTypeInvokeContract') {
    throw invalidActivation();
  }
  const call = operation.func.invokeContract;
  const matchesClaim = tx.source === claimant
    && Boolean(tx.signatures?.length)
    && Address.fromScAddress(call.contractAddress).toString() === contractId()
    && String(call.functionName) === 'activate_product'
    && call.args.length === 3
    && scValToNative(call.args[0]) === BigInt(tokenId)
    && scValToNative(call.args[1]) === claimant;
  // Nothing may be authorized on behalf of another address: only the buyer's own source-account credentials.
  const authorizedBySource = (operation.auth || []).every(({ credentials }) => credentials.type === 'sorobanCredentialsSourceAccount');
  if (!matchesClaim || !authorizedBySource) throw invalidActivation();

  // A fee bump adds no operation and uses no sequence number of its own: it only changes who pays.
  const issuer = adminKeypair();
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(issuer, FEE_BUMP_BASE_FEE, tx, networkPassphrase);
  feeBump.sign(issuer);
  const sent = await rpcServer.sendTransaction(feeBump);
  if (sent.status !== 'PENDING' && sent.status !== 'DUPLICATE') {
    throw new Error(`Stellar rechazó la activación (${sent.status} ${sent.errorResult?.result().switch().name || ''}).`);
  }
  await waitForTransaction(sent.hash);
  const product = await readProduct(tokenId);
  if (!product.claimed || product.owner !== claimant) throw new Error(`La transacción ${sent.hash} no dejó la garantía a nombre de ${claimant}.`);
  return sent.hash;
};
