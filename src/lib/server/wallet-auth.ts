// Proof that a request comes from the owner of a Stellar account, without any password or server-side session.
//
// The browser asks for a nonce, signs it with its Cavos wallet (`wallet.signMessage`) and sends the signature back.
// Cavos signs with the account's *control key*, which is a different address from the account itself, so a signature
// is accepted only when that key is a signer of the account on-chain. Each nonce works once and for a few minutes, so
// a captured signature cannot be replayed.
import { randomUUID } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { isStellarAddress } from '../validation';
import { HttpError } from './errors';
import { singleton } from './singleton';

const CAVOS_MESSAGE_PREFIX = 'Cavos Signed Message:\n';
const NONCE_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_NONCES = 2000;
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

const nonces = singleton('wallet-auth-nonces', () => new Map<string, { owner: string; until: number }>());

const dropExpired = (now: number) => {
  for (const [nonce, pending] of nonces) if (pending.until <= now) nonces.delete(nonce);
};

export const issueNonce = (owner: string): string => {
  if (!isStellarAddress(owner)) throw new HttpError(400, 'Indica una dirección pública Stellar válida (G...).');
  const now = Date.now();
  dropExpired(now);
  if (nonces.size > MAX_PENDING_NONCES) nonces.clear();
  const nonce = `verifire-${randomUUID()}`;
  nonces.set(nonce, { owner, until: now + NONCE_TTL_MS });
  return nonce;
};

// What Cavos actually signs: the message with its domain prefix and its length.
const prefixed = (message: string) => {
  const body = Buffer.from(message, 'utf8');
  return Buffer.concat([Buffer.from(`${CAVOS_MESSAGE_PREFIX}${body.length}\n`, 'utf8'), body]);
};

// Whether `key` may act for `account`: the account itself, or one of its signers.
const signsFor = async (account: string, key: string): Promise<boolean> => {
  if (account === key) return true;
  const response = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(account)}`);
  if (response.status === 404) return false;
  if (!response.ok) throw new HttpError(503, 'No se pudo comprobar tu cuenta en Stellar. Intentá de nuevo en unos segundos.', { retryable: true });
  const { signers } = (await response.json()) as { signers?: { key: string; weight: number }[] };
  return (signers ?? []).some((signer) => signer.key === key && signer.weight > 0);
};

interface WalletProof {
  owner: string;
  nonce: string;
  // Base64, as the browser sends it.
  signature: string;
  // The control key that signed, in G… form.
  publicKey: string;
}

// Throws unless the signature proves that whoever sent it holds the wallet of `owner`.
export const assertWalletOwner = async ({ owner, nonce, signature, publicKey }: WalletProof) => {
  const invalid = () => new HttpError(401, 'No pudimos comprobar que esta wallet sea tuya. Volvé a intentarlo.');
  if (!isStellarAddress(owner) || !isStellarAddress(publicKey)) throw invalid();
  const pending = nonces.get(nonce);
  // Single use: the nonce is spent whether or not the signature turns out to be good.
  nonces.delete(nonce);
  if (!pending || pending.owner !== owner || pending.until <= Date.now()) throw invalid();

  const bytes = Buffer.from(signature, 'base64');
  if (bytes.length !== 64) throw invalid();
  try {
    if (!Keypair.fromPublicKey(publicKey).verify(prefixed(nonce), bytes)) throw invalid();
  } catch {
    throw invalid();
  }
  if (!(await signsFor(owner, publicKey))) throw invalid();
};
