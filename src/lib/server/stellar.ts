// Access to the Verifire product contract on Stellar testnet. Holds the issuer key: never import it in the browser.
// Also run directly by Node from scripts/, so it reads no astro:env and its relative imports keep the .ts extension.
import {
  Account, Address, BASE_FEE, Contract, FeeBumpTransaction, Keypair, Networks, TransactionBuilder,
  hash, nativeToScVal, rpc, scValToNative, xdr
} from '@stellar/stellar-sdk';
import { ACTIVATION_DOMAIN } from '../activation.ts';
import { HttpError } from './errors.ts';

export const networkPassphrase = Networks.TESTNET;
const DEFAULT_RPC_URL = 'https://soroban-testnet.stellar.org';
// Inclusion fee the issuing account pays per certification; the inner transaction's resource fee is added on top.
const FEE_BUMP_BASE_FEE = '2000';
// The issuing account pays every call a user signs, and a Soroban fee is mostly the resource fee written inside the
// transaction. The signer could write any amount there, so a signed call may cost at most this many times what its
// simulation says it needs; anything above that is a transaction built to drain the issuer, not to use the contract.
const MAX_FEE_OVER_SIMULATION = 4n;

export interface StellarConfig {
  contractId: string;
  // Issuing account (the "notary"): it only registers products and certifies warranties, and pays the network fees
  // of those transactions. The company's money moves through a separate treasury account (COSMOS_PAY_DESTINATION),
  // which never signs here, so a buyer reading a certificate cannot reach the company's finances.
  issuerSecret: string;
  rpcUrl?: string | undefined;
}

export const stellarConfigFromEnv = (env: Record<string, string | undefined>): StellarConfig => ({
  contractId: env['STELLAR_CONTRACT_ID'] || '',
  // STELLAR_ADMIN_SECRET is the old name of the same key.
  issuerSecret: env['STELLAR_ISSUER_SECRET'] || env['STELLAR_ADMIN_SECRET'] || '',
  rpcUrl: env['STELLAR_RPC_URL'] || undefined
});

export interface ProductToMint {
  token: string;
  model: string;
  lot: string;
  destination: string;
  secretCode: string;
}

export interface OnChainProduct {
  claimed: boolean;
  owner: string | null;
  // Public key of the open transfer link, if any.
  transfer_key: Uint8Array | null;
}

export const isTxHash = (value: unknown): value is string => /^[0-9a-f]{64}$/i.test(String(value ?? ''));
export const explorerTxUrl = (txHash: string) => `https://stellar.expert/explorer/testnet/tx/${txHash}`;

// ed25519 public key derived from the secret inside the package; only this key is registered on-chain.
export const activationKeyFor = (secret: string): Buffer =>
  Buffer.from(Keypair.fromRawEd25519Seed(hash(Buffer.from(`${ACTIVATION_DOMAIN}:${secret}`, 'utf8'))).rawPublicKey());

const contractMessages: [RegExp, string][] = [
  [/product is already claimed/, 'Este producto ya fue reclamado en Stellar.'],
  [/only the owner can transfer/, 'Solo el dueño actual puede transferir este producto.'],
  [/no open transfer/, 'Este link de transferencia ya no está vigente: el dueño lo canceló, generó otro o el producto ya cambió de dueño.'],
  [/already owns the product/, 'Este producto ya es tuyo.'],
  [/transfer link expired/, 'Este link de transferencia venció. Pedile al dueño que genere uno nuevo.'],
  [/wait before opening another transfer link/, 'Ya generaste un link hace poco. Esperá unos minutos para pedir otro.'],
  [/product token does not exist|product code does not exist/, 'Este producto no está registrado en el contrato de Stellar.'],
  [/ed25519|signature|crypto/i, 'La firma del QR no corresponde a este producto.']
];

// Known contract panics become messages safe to show to the client.
const contractError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = contractMessages.find(([pattern]) => pattern.test(message));
  if (match) return new HttpError(409, match[1]);
  return error instanceof Error ? error : new Error(message);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const u64 = (value: number | bigint) => nativeToScVal(BigInt(value), { type: 'u64' });
const text = (value: string) => nativeToScVal(String(value), { type: 'string' });
const invalidSignedCall = () => new HttpError(400, 'La transacción firmada no corresponde a la operación pedida sobre este producto.');

// A contract call signed by a user's wallet: which function, by whom, and the leading arguments it must carry.
interface UserCall {
  method: string;
  source: string;
  args: xdr.ScVal[];
}

interface SignedUserCall {
  method: string;
  source: string;
  argCount: number;
  // Native values the first arguments must have (token id as bigint, addresses as G... strings).
  expectedArgs: unknown[];
  signedXdr: string;
}

export const createStellarClient = ({ contractId, issuerSecret, rpcUrl = DEFAULT_RPC_URL }: StellarConfig) => {
  const rpcServer = new rpc.Server(rpcUrl);
  let issuer: Keypair | null = null;
  const issuerKeypair = () => (issuer ??= Keypair.fromSecret(issuerSecret));
  const contract = () => new Contract(contractId);

  const waitForTransaction = async (txHash: string) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const result = await rpcServer.getTransaction(txHash);
      if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) return result;
      if (result.status === rpc.Api.GetTransactionStatus.FAILED) throw new Error(`La transacción ${txHash} falló en Stellar.`);
      await sleep(1500);
    }
    throw new Error(`Stellar no confirmó la transacción ${txHash} a tiempo.`);
  };

  const rejectionReason = (sent: rpc.Api.SendTransactionResponse) => `${sent.status} ${sent.errorResult?.result.type ?? ''}`.trim();

  // Transactions signed by the same account go one at a time, so their sequence numbers never collide.
  let submitQueue: Promise<unknown> = Promise.resolve();

  const submitOperation = (keypair: Keypair, operation: xdr.Operation) => {
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
        throw new Error(`Stellar rechazó la transacción (${rejectionReason(sent)}).`);
      }
      const result = await waitForTransaction(sent.hash);
      return { txHash: sent.hash, returnValue: result.returnValue ? (scValToNative(result.returnValue) as unknown) : undefined };
    });
    submitQueue = run.catch(() => {});
    return run;
  };

  // Read-only call: simulated, never submitted, so it needs no fee or sequence number.
  const simulate = async (method: string, ...args: xdr.ScVal[]): Promise<unknown> => {
    const source = new Account(issuerKeypair().publicKey(), '0');
    const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase }).addOperation(contract().call(method, ...args)).setTimeout(30).build();
    const simulation = await rpcServer.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simulation)) throw contractError(simulation.error);
    if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result) throw new Error(`La simulación de ${method} no devolvió un resultado.`);
    return scValToNative(simulation.result.retval);
  };

  const readProduct = async (tokenId: number | bigint) => (await simulate('get_product', u64(tokenId))) as OnChainProduct;

  const accountExists = async (address: string) => {
    try {
      await rpcServer.getAccount(address);
      return true;
    } catch {
      return false;
    }
  };

  // Unsigned call for a user's wallet. The user's account is the SOURCE of the transaction, so the contract's
  // require_auth is satisfied by the envelope signature. A signature placed inside a Soroban auth entry would be lost
  // instead: the Cavos kit signs entries on a decoded copy, and its SDK re-serializes the transaction from the original
  // XDR, keeping only the envelope signatures. Simulating here also runs the contract's checks, so a wrong QR or link
  // fails before the user signs anything.
  const buildUserCall = async ({ method, source, args }: UserCall) => {
    // require_auth cannot authenticate an account that does not exist on-chain yet.
    if (!(await accountExists(source))) {
      throw new HttpError(409, 'Tu cuenta Stellar todavía no existe en la red. Volvé a intentarlo.');
    }
    const account = await rpcServer.getAccount(source);
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
      .addOperation(contract().call(method, ...args))
      .setTimeout(300)
      .build();
    try {
      return (await rpcServer.prepareTransaction(tx)).toXdr();
    } catch (error) {
      throw contractError(error);
    }
  };

  // Submits a call the user's wallet signed. Its envelope signature is what authorizes the contract call; the issuing
  // account only pays, by wrapping the transaction in a fee bump, so a user holding no XLM can still use the contract.
  const submitUserCall = async ({ method, source, argCount, expectedArgs, signedXdr }: SignedUserCall) => {
    let tx;
    try {
      tx = TransactionBuilder.fromXdr(signedXdr, networkPassphrase);
    } catch {
      throw invalidSignedCall();
    }
    if (tx instanceof FeeBumpTransaction) throw invalidSignedCall();
    // SDK 17 exposes XDR unions as objects with a `type` tag and named fields.
    const [operation] = tx.operations;
    if (tx.operations.length !== 1 || operation?.type !== 'invokeHostFunction' || operation.func.type !== 'hostFunctionTypeInvokeContract') {
      throw invalidSignedCall();
    }
    const call = operation.func.invokeContract;
    const matchesCall = tx.source === source
      && tx.signatures.length > 0
      && Address.fromScAddress(call.contractAddress).toString() === contractId
      && String(call.functionName) === method
      && call.args.length === argCount
      && expectedArgs.every((expected, index) => {
        const arg = call.args[index];
        return arg !== undefined && scValToNative(arg) === expected;
      });
    // Nothing may be authorized on behalf of another address: only the user's own source-account credentials.
    const authorizedBySource = (operation.auth ?? []).every(({ credentials }) => credentials.type === 'sorobanCredentialsSourceAccount');
    if (!matchesCall || !authorizedBySource) throw invalidSignedCall();

    // What this call costs is decided by the network, not by whoever signed it.
    const simulation = await rpcServer.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simulation)) throw contractError(simulation.error);
    const resourceFee = rpc.Api.isSimulationSuccess(simulation) ? BigInt(simulation.minResourceFee ?? '0') : 0n;
    if (BigInt(tx.fee) > (resourceFee + BigInt(BASE_FEE)) * MAX_FEE_OVER_SIMULATION) throw invalidSignedCall();

    // A fee bump adds no operation and uses no sequence number of its own: it only changes who pays.
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(issuerKeypair(), FEE_BUMP_BASE_FEE, tx, networkPassphrase);
    feeBump.sign(issuerKeypair());
    const sent = await rpcServer.sendTransaction(feeBump);
    if (sent.status !== 'PENDING' && sent.status !== 'DUPLICATE') {
      throw new Error(`Stellar rechazó la transacción ${method} (${rejectionReason(sent)}).`);
    }
    await waitForTransaction(sent.hash);
    return sent.hash;
  };

  // The contract answers a mint with the new token's id. Anything else (a dropped return value) would be stored as a
  // token that does not exist, and every later call for that product would fail with no way back.
  const tokenIdOf = (returnValue: unknown) => {
    const tokenId = Number(returnValue);
    if (!Number.isInteger(tokenId) || tokenId < 0) throw new Error('El contrato no devolvió el número de token del producto.');
    return tokenId;
  };

  const address = (value: string) => Address.fromString(value).toScVal();

  // The release wasm drops panic messages ("UnreachableCodeReached"), so the states a call needs are read first.
  const assertOwnedBy = async (tokenId: number, owner: string) => {
    if ((await readProduct(tokenId)).owner !== owner) throw new HttpError(409, 'Solo el dueño actual puede transferir este producto.');
  };

  return {
    rpcServer,
    enabled: Boolean(contractId && issuerSecret),
    contractId,
    submitOperation,
    readProduct,

    // Existing account that receives the 1-stroop payment the Cavos kit makes when it creates a user's account.
    issuerAddress: () => issuerKeypair().publicKey(),

    mintProduct: async (product: ProductToMint) => {
      const { txHash, returnValue } = await submitOperation(issuerKeypair(), contract().call(
        'mint_product',
        text(product.token), text(product.model), text(product.lot), text(product.destination),
        xdr.ScVal.scvBytes(activationKeyFor(product.secretCode))
      ));
      return { tokenId: tokenIdOf(returnValue), mintTx: txHash };
    },

    // Registers a product whose warranty is already active, with its current owner, in a new deployment of the contract.
    importClaimedProduct: async (product: ProductToMint, owner: string) => {
      const { txHash, returnValue } = await submitOperation(issuerKeypair(), contract().call(
        'import_claimed_product',
        text(product.token), text(product.model), text(product.lot), text(product.destination),
        xdr.ScVal.scvBytes(activationKeyFor(product.secretCode)), address(owner)
      ));
      return { tokenId: tokenIdOf(returnValue), mintTx: txHash };
    },

    // Bytes the activation key signs in the browser. They bind this contract, the token and the claimant.
    activationMessage: async (tokenId: number, claimant: string) =>
      Buffer.from((await simulate('activation_message', u64(tokenId), address(claimant))) as Uint8Array),

    buildActivation: async ({ tokenId, claimant, signature }: { tokenId: number; claimant: string; signature: Uint8Array }) => {
      if ((await readProduct(tokenId)).claimed) {
        throw new HttpError(409, 'Este producto ya fue reclamado en Stellar.');
      }
      return buildUserCall({
        method: 'activate_product',
        source: claimant,
        args: [u64(tokenId), address(claimant), xdr.ScVal.scvBytes(Buffer.from(signature))]
      });
    },

    // Returns the hash once the contract shows the new owner.
    submitActivation: async ({ tokenId, claimant, signedXdr }: { tokenId: number; claimant: string; signedXdr: string }) => {
      const txHash = await submitUserCall({
        method: 'activate_product', source: claimant, argCount: 3, expectedArgs: [BigInt(tokenId), claimant], signedXdr
      });
      const product = await readProduct(tokenId);
      if (!product.claimed || product.owner !== claimant) throw new Error(`La transacción ${txHash} no dejó la garantía a nombre de ${claimant}.`);
      return txHash;
    },

    // The owner opens a transfer link: only the public key of its secret reaches the contract.
    buildTransferOffer: async ({ tokenId, owner, transferKey }: { tokenId: number; owner: string; transferKey: Uint8Array }) => {
      await assertOwnedBy(tokenId, owner);
      return buildUserCall({
        method: 'offer_transfer', source: owner, args: [u64(tokenId), address(owner), xdr.ScVal.scvBytes(Buffer.from(transferKey))]
      });
    },

    submitTransferOffer: async ({ tokenId, owner, transferKey, signedXdr }: { tokenId: number; owner: string; transferKey: Uint8Array; signedXdr: string }) => {
      const txHash = await submitUserCall({ method: 'offer_transfer', source: owner, argCount: 3, expectedArgs: [BigInt(tokenId), owner], signedXdr });
      const offered = (await readProduct(tokenId)).transfer_key;
      if (!offered || !Buffer.from(offered).equals(Buffer.from(transferKey))) throw new Error(`La transacción ${txHash} no abrió el link de transferencia.`);
      return txHash;
    },

    buildTransferCancel: async ({ tokenId, owner }: { tokenId: number; owner: string }) => {
      await assertOwnedBy(tokenId, owner);
      return buildUserCall({ method: 'cancel_transfer', source: owner, args: [u64(tokenId), address(owner)] });
    },

    submitTransferCancel: async ({ tokenId, owner, signedXdr }: { tokenId: number; owner: string; signedXdr: string }) => {
      const txHash = await submitUserCall({ method: 'cancel_transfer', source: owner, argCount: 2, expectedArgs: [BigInt(tokenId), owner], signedXdr });
      if ((await readProduct(tokenId)).transfer_key) throw new Error(`La transacción ${txHash} no cerró el link de transferencia.`);
      return txHash;
    },

    // [expires_at, last_offer_at] of the product's transfer link, in ledger seconds (0 when there is none).
    transferTimes: async (tokenId: number) =>
      ((await simulate('transfer_times', u64(tokenId))) as bigint[]).map(Number) as [number, number],

    // Bytes the transfer key signs in the recipient's browser. They bind this contract, the token and the recipient.
    transferMessage: async (tokenId: number, recipient: string) =>
      Buffer.from((await simulate('transfer_message', u64(tokenId), address(recipient))) as Uint8Array),

    buildTransferAccept: async ({ tokenId, recipient, signature }: { tokenId: number; recipient: string; signature: Uint8Array }) => {
      const product = await readProduct(tokenId);
      if (!product.transfer_key) throw new HttpError(409, 'Este link de transferencia ya no está vigente: el dueño lo canceló, generó otro o el producto ya cambió de dueño.');
      if (product.owner === recipient) throw new HttpError(409, 'Este producto ya es tuyo.');
      try {
        return await buildUserCall({
          method: 'accept_transfer', source: recipient, args: [u64(tokenId), address(recipient), xdr.ScVal.scvBytes(Buffer.from(signature))]
        });
      } catch (error) {
        // The contract's signature check fails the same way for a QR and for a link: name the link here.
        if (error instanceof HttpError && /firma/.test(error.message)) throw new HttpError(409, 'La firma del link de transferencia no corresponde a este producto.');
        throw error;
      }
    },

    submitTransferAccept: async ({ tokenId, recipient, signedXdr }: { tokenId: number; recipient: string; signedXdr: string }) => {
      const txHash = await submitUserCall({
        method: 'accept_transfer', source: recipient, argCount: 3, expectedArgs: [BigInt(tokenId), recipient], signedXdr
      });
      if ((await readProduct(tokenId)).owner !== recipient) throw new Error(`La transacción ${txHash} no dejó el producto a nombre de ${recipient}.`);
      return txHash;
    }
  };
};

export type StellarClient = ReturnType<typeof createStellarClient>;
