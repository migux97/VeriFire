// Warranty claims.
// On Stellar, in three steps, and the secret never reaches the server: the product is found by its activation key.
// 1. prepareClaim: the browser derives the activation key from the QR and gets the message to sign with it.
// 2. buildClaimTransaction: with that signature the server builds the activation; the buyer's wallet authorizes it.
// 3. submitOnChainClaim with signedXdr: the issuing account submits it and the claim is saved with its hash.
// Without a contract (demo mode) the secret read from the QR identifies the product and the claim stays in this server.
import { randomUUID } from 'node:crypto';
import type { PreparedClaim, Warranty } from '../types';
import { isStellarAddress, normalizeId } from '../validation';
import { chain } from './chain';
import { reconcileProduct } from './chain-sync';
import { HttpError } from './errors';
import { textField, type JsonBody } from './http';
import { secretFromQrKey } from './links';
import { activationKeyOf, anchorPendingProducts, isCurrentOnChain, recordRejectedClaim, transferredBy, warrantyView } from './products';
import { messages } from './messages';
import { singleton } from './singleton';
import { hashSecret, saveState, store, type Product } from './store';


// Keeps a second request for the same product from submitting a duplicate transaction.
const claimsInFlight = singleton('claims-in-flight', () => new Set<string>());

// Throws when the product cannot be claimed by this owner. Another account holding the secret of a product that
// already has an owner is kept in the product's history: its label may have been copied.
const assertClaimable = (product: Product, owner: string) => {
  if (product.claimed) {
    if (product.owner === owner) throw new HttpError(409, 'Esta garantía ya está activada a tu nombre.');
    if (isStellarAddress(owner)) recordRejectedClaim(product, owner);
    throw new HttpError(409, messages.alreadyClaimed);
  }
  if (!isStellarAddress(owner)) throw new HttpError(400, messages.invalidOwner);
};

// Runs synchronously after the request body was read, so two concurrent claims cannot both pass the check.
const completeClaim = (product: Product, owner: string, baseUrl: string, claimTransaction = `demo-${randomUUID()}`): Warranty => {
  assertClaimable(product, owner);
  Object.assign(product, { claimed: true, owner, claimedAt: new Date().toISOString(), claimTransaction });
  saveState();
  return warrantyView(product, baseUrl);
};

// Checks shared by the three on-chain steps.
const onChainClaim = async (body: JsonBody) => {
  if (!chain.enabled) throw new HttpError(409, 'La activación en Stellar no está configurada en este servidor.');
  const key = textField(body, 'activationKey').toLowerCase();
  const found = /^[0-9a-f]{64}$/.test(key) ? [...store.products.values()].find((candidate) => activationKeyOf(candidate) === key) : undefined;
  if (!found) throw new HttpError(404, messages.qrNotFound);
  // An activation that landed after this server stopped waiting for it is adopted here, so the buyer sees the
  // warranty instead of "ya fue reclamado en Stellar" with no way out.
  const product = await reconcileProduct(found);
  const owner = textField(body, 'owner').trim();
  assertClaimable(product, owner);
  if (!isCurrentOnChain(product)) {
    anchorPendingProducts();
    throw new HttpError(409, 'Este producto todavía se está registrando en Stellar. Probá de nuevo en unos minutos.', { retryable: true });
  }
  return { product, owner, tokenId: product.chain.tokenId };
};

export const prepareClaim = async (body: JsonBody): Promise<PreparedClaim> => {
  // Without a contract the browser falls back to the demo claim.
  if (!chain.enabled) return { onChain: false };
  const { tokenId, owner } = await onChainClaim(body);
  const message = await chain.activationMessage(tokenId, owner);
  // feeAccount: an existing account for the payment with which the Cavos kit creates a new buyer account.
  return { onChain: true, message: message.toString('base64'), feeAccount: chain.issuerAddress() };
};

export const buildClaimTransaction = async (body: JsonBody) => {
  const { tokenId, owner } = await onChainClaim(body);
  const signature = Buffer.from(textField(body, 'signature'), 'base64');
  if (signature.length !== 64) throw new HttpError(400, 'La firma del QR no es válida.');
  return { xdr: await chain.buildActivation({ tokenId, claimant: owner, signature }) };
};

export const submitOnChainClaim = async (body: JsonBody, baseUrl: string) => {
  const { product, owner, tokenId } = await onChainClaim(body);
  if (claimsInFlight.has(product.token)) {
    throw new HttpError(409, 'La activación de este producto ya se está registrando en Stellar.', { retryable: true });
  }
  claimsInFlight.add(product.token);
  try {
    const txHash = await chain.submitActivation({ tokenId, claimant: owner, signedXdr: textField(body, 'signedXdr') });
    return completeClaim(product, owner, baseUrl, txHash);
  } finally {
    claimsInFlight.delete(product.token);
  }
};

// Demo claim: current QR links send the opaque key; labels printed before send the code itself.
export const claimDemoWarranty = (body: JsonBody, baseUrl: string) => {
  const qr = textField(body, 'qr');
  const secret = normalizeId(qr ? secretFromQrKey(qr) : textField(body, 'secret'));
  const product = secret ? [...store.products.values()].find((candidate) => candidate.secretHash === hashSecret(secret)) : undefined;
  if (!product) throw new HttpError(404, messages.qrNotFound);
  // Products with a secret code are activated in the contract once it is configured, never only locally.
  // Already claimed ones fall through, so completeClaim answers "ya fue reclamado".
  if (chain.enabled && product.secretCode && !product.claimed) {
    throw new HttpError(409, 'Este producto se activa en Stellar. Recargá la página y volvé a escanear el QR.');
  }
  return completeClaim(product, textField(body, 'owner').trim(), baseUrl);
};

export const warrantiesOf = (owner: string, baseUrl: string) => {
  if (!isStellarAddress(owner)) throw new HttpError(400, messages.invalidOwner);
  const warranties = [...store.products.values()]
    .filter((product) => product.claimed && product.owner === owner)
    .sort((first, second) => String(second.claimedAt ?? '').localeCompare(String(first.claimedAt ?? '')))
    .map((product) => warrantyView(product, baseUrl));
  return { owner, warranties, transferred: transferredBy(owner) };
};
