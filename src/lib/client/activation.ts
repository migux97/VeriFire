// Warranty activation from the buyer's panel.
// The secret QR becomes an ed25519 key here (same derivation as the contract and src/lib/server/stellar.ts). The
// browser signs the activation with it and sends only the public key and the signature: the secret never leaves the page.
import type { CavosStellar } from '@cavos/kit';
import { ACTIVATION_DOMAIN } from '../activation';
import type { PreparedClaim, Warranty } from '../types';
import { ApiError, postJson } from './api';
import { base64ToBytes, base64UrlToBytes, bytesToBase64, bytesToHex } from './bytes';
import type { ScannedClaim } from './qr';
import { connectSigningWallet } from './wallet';

export type Progress = (message: string) => void;

export interface SigningKey {
  privateKey: CryptoKey;
  // Hex of the raw 32-byte public key.
  publicKey: string;
}

// PKCS#8 header for a raw 32-byte Ed25519 private key, which WebCrypto cannot import as "raw".
const ED25519_PKCS8_HEADER = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];

// Same decoding as secretFromQrKey + normalizeId on the server.
const secretFromClaim = (claim: ScannedClaim) => {
  try {
    if ('secret' in claim) return claim.secret.trim().toUpperCase();
    if (claim.qr.startsWith('.')) return new TextDecoder().decode(base64UrlToBytes(claim.qr.slice(1))).trim().toUpperCase();
    const bytes = base64UrlToBytes(claim.qr);
    return bytes.length === 10 ? `VF-SECRET-${bytesToHex(bytes).toUpperCase()}` : '';
  } catch {
    return '';
  }
};

// seed = sha256("<domain>:" + secret), the same derivation as the contract. Used for the secret QR and transfer links.
export const deriveSigningKey = async (domain: string, secret: string): Promise<SigningKey> => {
  if (!window.crypto?.subtle) throw new Error('Abrí Verifire con https:// o desde localhost para usar tu wallet.');
  const seed = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${domain}:${secret}`)));
  try {
    const privateKey = await crypto.subtle.importKey('pkcs8', new Uint8Array([...ED25519_PKCS8_HEADER, ...seed]), { name: 'Ed25519' }, true, ['sign']);
    const { x = '' } = await crypto.subtle.exportKey('jwk', privateKey);
    return { privateKey, publicKey: bytesToHex(base64UrlToBytes(x)) };
  } catch {
    throw new Error('Este navegador no puede firmar con claves ed25519. Actualizalo o probá con una versión reciente de Chrome, Edge, Firefox o Safari.');
  }
};

export const signWith = async (key: SigningKey, messageBase64: string) =>
  bytesToBase64(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key.privateKey, base64ToBytes(messageBase64))));

// The contract can only authorize an account that exists on-chain, and a Cavos account is created on its first
// transaction. The kit creates it (sponsored by Cavos) before the payment it is asked for; that 1-stroop payment can
// fail because the new account holds no XLM, which does not matter once the account exists.
export const ensureAccountCreated = async (wallet: CavosStellar, feeAccount: string, onProgress: Progress) => {
  if (wallet.status !== 'undeployed') return;
  onProgress('Creando tu cuenta en Stellar por única vez...');
  try {
    await wallet.execute(1n, feeAccount);
  } catch (error) {
    // execute() moves the status to "ready" as soon as the account exists, even when the payment itself failed.
    if ((wallet.status as string) !== 'ready') throw new Error(`No se pudo crear tu cuenta en Stellar: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const activateOnStellar = async (
  appId: string,
  activation: SigningKey,
  owner: string,
  prepared: Extract<PreparedClaim, { onChain: true }>,
  onProgress: Progress
) => {
  const request = { activationKey: activation.publicKey, owner };
  onProgress('Conectando tu wallet Cavos...');
  const wallet = await connectSigningWallet(appId, owner);
  await ensureAccountCreated(wallet, prepared.feeAccount, onProgress);
  const signature = await signWith(activation, prepared.message);
  const { xdr } = await postJson<{ xdr: string }>('/api/warranties/transaction', { ...request, signature }, 'No se pudo preparar la activación en Stellar.');
  onProgress('Autorizando la activación con tu wallet Cavos...');
  const signedXdr = await wallet.signXdr(xdr);
  onProgress('Registrando tu garantía en Stellar. Puede tardar unos segundos...');
  return postJson<Warranty>('/api/warranties', { ...request, signedXdr }, 'No se pudo registrar la activación en Stellar.');
};

// Uses the contract when the server has one. Without it, or for the seed product that has no secret code (the server
// does not know its key and answers 404), falls back to the demo claim stored only in the server.
export const activateWarranty = async (appId: string, claim: ScannedClaim, owner: string, onProgress: Progress) => {
  const secret = secretFromClaim(claim);
  if (secret) {
    const activation = await deriveSigningKey(ACTIVATION_DOMAIN, secret);
    let prepared: PreparedClaim | null = null;
    try {
      prepared = await postJson<PreparedClaim>('/api/warranties/prepare', { activationKey: activation.publicKey, owner }, 'No se pudo preparar la activación.');
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
    }
    if (prepared?.onChain) return activateOnStellar(appId, activation, owner, prepared, onProgress);
  }
  return postJson<Warranty>('/api/warranties', { ...claim, owner }, 'No se pudo activar la garantía.');
};
