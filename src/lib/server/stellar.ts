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
}

export const isTxHash = (value: unknown): value is string => /^[0-9a-f]{64}$/i.test(String(value ?? ''));
export const explorerTxUrl = (txHash: string) => `https://stellar.expert/explorer/testnet/tx/${txHash}`;

// ed25519 public key derived from the secret inside the package; only this key is registered on-chain.
export const activationKeyFor = (secret: string): Buffer =>
  Buffer.from(Keypair.fromRawEd25519Seed(hash(Buffer.from(`${ACTIVATION_DOMAIN}:${secret}`, 'utf8'))).rawPublicKey());

const contractMessages: [RegExp, string][] = [
  [/product is already claimed/, 'Este producto ya fue reclamado en Stellar.'],
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
const invalidActivation = () => new HttpError(400, 'La transacción firmada no corresponde a la activación de este producto.');

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

  return {
    rpcServer,
    enabled: Boolean(contractId && issuerSecret),
    submitOperation,
    readProduct,

    // Existing account that receives the 1-stroop payment the Cavos kit makes when it creates a buyer's account.
    issuerAddress: () => issuerKeypair().publicKey(),

    mintProduct: async (product: ProductToMint) => {
      const { txHash, returnValue } = await submitOperation(issuerKeypair(), contract().call(
        'mint_product',
        text(product.token), text(product.model), text(product.lot), text(product.destination),
        xdr.ScVal.scvBytes(activationKeyFor(product.secretCode))
      ));
      return { tokenId: Number(returnValue), mintTx: txHash };
    },

    // Bytes the activation key signs in the browser. They bind this contract, the token and the claimant.
    activationMessage: async (tokenId: number, claimant: string) =>
      Buffer.from((await simulate('activation_message', u64(tokenId), Address.fromString(claimant).toScVal())) as Uint8Array),

    // Unsigned activation for the buyer's wallet. The buyer's account is the SOURCE of the transaction, so the
    // contract's require_auth is satisfied by the envelope signature. A signature placed inside a Soroban auth entry
    // would be lost instead: the Cavos kit signs entries on a decoded copy, and its SDK re-serializes the transaction
    // from the original XDR, keeping only the envelope signatures.
    // Simulating here also runs the contract's signature check, so a wrong QR fails before the buyer signs anything.
    buildActivation: async ({ tokenId, claimant, signature }: { tokenId: number; claimant: string; signature: Uint8Array }) => {
      // require_auth cannot authenticate an account that does not exist on-chain yet.
      if (!(await accountExists(claimant))) {
        throw new HttpError(409, 'Tu cuenta Stellar todavía no existe en la red. Volvé a intentar la activación.');
      }
      // The release wasm drops panic messages ("UnreachableCodeReached"), so the claimed state is read first.
      if ((await readProduct(tokenId)).claimed) {
        throw new HttpError(409, 'Este producto ya fue reclamado en Stellar.');
      }
      const account = await rpcServer.getAccount(claimant);
      const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
        .addOperation(contract().call('activate_product', u64(tokenId), Address.fromString(claimant).toScVal(), xdr.ScVal.scvBytes(Buffer.from(signature))))
        .setTimeout(300)
        .build();
      try {
        return (await rpcServer.prepareTransaction(tx)).toXdr();
      } catch (error) {
        throw contractError(error);
      }
    },

    // Submits the activation the buyer's wallet signed. The buyer's account is the source, so its envelope signature
    // is what authorizes the contract call; the issuing account only pays, by wrapping the transaction in a fee bump,
    // so a buyer holding no XLM can still certify. Returns the hash once the contract shows the new owner.
    submitActivation: async ({ tokenId, claimant, signedXdr }: { tokenId: number; claimant: string; signedXdr: string }) => {
      let tx;
      try {
        tx = TransactionBuilder.fromXdr(signedXdr, networkPassphrase);
      } catch {
        throw invalidActivation();
      }
      if (tx instanceof FeeBumpTransaction) throw invalidActivation();
      // SDK 17 exposes XDR unions as objects with a `type` tag and named fields.
      const [operation] = tx.operations;
      if (tx.operations.length !== 1 || operation?.type !== 'invokeHostFunction' || operation.func.type !== 'hostFunctionTypeInvokeContract') {
        throw invalidActivation();
      }
      const call = operation.func.invokeContract;
      const [tokenArg, claimantArg] = call.args;
      const matchesClaim = tx.source === claimant
        && tx.signatures.length > 0
        && Address.fromScAddress(call.contractAddress).toString() === contractId
        && String(call.functionName) === 'activate_product'
        && call.args.length === 3
        && tokenArg !== undefined && scValToNative(tokenArg) === BigInt(tokenId)
        && claimantArg !== undefined && scValToNative(claimantArg) === claimant;
      // Nothing may be authorized on behalf of another address: only the buyer's own source-account credentials.
      const authorizedBySource = (operation.auth ?? []).every(({ credentials }) => credentials.type === 'sorobanCredentialsSourceAccount');
      if (!matchesClaim || !authorizedBySource) throw invalidActivation();

      // A fee bump adds no operation and uses no sequence number of its own: it only changes who pays.
      const feeBump = TransactionBuilder.buildFeeBumpTransaction(issuerKeypair(), FEE_BUMP_BASE_FEE, tx, networkPassphrase);
      feeBump.sign(issuerKeypair());
      const sent = await rpcServer.sendTransaction(feeBump);
      if (sent.status !== 'PENDING' && sent.status !== 'DUPLICATE') {
        throw new Error(`Stellar rechazó la activación (${rejectionReason(sent)}).`);
      }
      await waitForTransaction(sent.hash);
      const product = await readProduct(tokenId);
      if (!product.claimed || product.owner !== claimant) throw new Error(`La transacción ${sent.hash} no dejó la garantía a nombre de ${claimant}.`);
      return sent.hash;
    }
  };
};

export type StellarClient = ReturnType<typeof createStellarClient>;
