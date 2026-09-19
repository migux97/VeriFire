// Passing an activated product to a new owner through a link.
// The owner's browser creates a random secret for the link and derives an ed25519 key from it (TRANSFER_DOMAIN). Only
// the public key reaches the server and the contract (offer_transfer). Whoever opens the link derives the same key,
// signs transfer_message with it and accepts with their own wallet (accept_transfer): the secret never leaves the link.
// Every call that changes the contract goes in two requests, like activations: without signedXdr the server answers the
// unsigned transaction for the user's wallet; with it, the issuing account pays and submits it.
import type { PreparedTransfer, Warranty } from '../types';
import { isStellarAddress } from '../validation';
import { chain } from './chain';
import { HttpError } from './errors';
import { textField, type JsonBody } from './http';
import {
  anchorPendingProducts, findProduct, isCurrentOnChain, openTransferOf, recordEvent, shortAddress,
  TRANSFER_LINK_MS, warrantyView
} from './products';
import { singleton } from './singleton';
import { saveState, store, type Product } from './store';

type Step = { xdr: string } | { warranty: Warranty };

const LINK_EXPIRED = 'Este link de transferencia ya no está vigente: el dueño lo canceló, generó otro o el producto ya cambió de dueño.';
const NOT_OWNER = 'Solo el dueño actual puede transferir este producto.';
const LINK_TIMED_OUT = 'Este link de transferencia venció. Pedile al dueño que genere uno nuevo.';

// Keeps two requests for the same product from submitting at the same time.
const inFlight = singleton('transfers-in-flight', () => new Set<string>());

const exclusive = async <T>(product: Product, task: () => Promise<T>) => {
  if (inFlight.has(product.token)) {
    throw new HttpError(409, 'Ya se está registrando un cambio de este producto en Stellar. Esperá unos segundos.', { retryable: true });
  }
  inFlight.add(product.token);
  try {
    return await task();
  } finally {
    inFlight.delete(product.token);
  }
};

const requireChain = () => {
  if (!chain.enabled) throw new HttpError(409, 'Las transferencias necesitan el contrato de Stellar configurado en este servidor.');
};

const transferKeyOf = (body: JsonBody) => {
  const key = textField(body, 'transferKey').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(key)) throw new HttpError(400, 'La clave del link de transferencia no es válida.');
  return key;
};

// The owner's side: the product by its public token, held by the account asking.
const ownedProduct = (body: JsonBody) => {
  requireChain();
  const product = findProduct(textField(body, 'token'));
  if (!product) throw new HttpError(404, 'El producto no existe.');
  const owner = textField(body, 'owner').trim();
  if (!isStellarAddress(owner) || !product.claimed || product.owner !== owner) throw new HttpError(403, NOT_OWNER);
  if (!isCurrentOnChain(product)) {
    anchorPendingProducts();
    throw new HttpError(409, 'Este producto todavía se está registrando en el contrato de Stellar. Probá de nuevo en unos minutos.', { retryable: true });
  }
  return { product, owner, tokenId: product.chain.tokenId };
};

// The recipient's side: the product whose open link matches the key derived from the link's secret.
const offeredProduct = (body: JsonBody) => {
  requireChain();
  const key = transferKeyOf(body);
  const product = [...store.products.values()].find((candidate) => candidate.transfer?.key === key);
  if (!product || !isCurrentOnChain(product)) throw new HttpError(404, LINK_EXPIRED);
  if (!openTransferOf(product)) throw new HttpError(410, LINK_TIMED_OUT);
  const recipient = textField(body, 'recipient').trim();
  if (!isStellarAddress(recipient)) throw new HttpError(400, 'Indica una dirección pública Stellar válida (G...).');
  if (product.owner === recipient) throw new HttpError(409, 'Este producto ya es tuyo. Para pasárselo a otra persona, compartile el link.');
  return { product, recipient, tokenId: product.chain.tokenId };
};

export const offerTransfer = async (body: JsonBody, baseUrl: string): Promise<Step> => {
  const { product, owner, tokenId } = ownedProduct(body);
  const key = transferKeyOf(body);
  const transferKey = Buffer.from(key, 'hex');
  const signedXdr = textField(body, 'signedXdr');
  if (!signedXdr) return { xdr: await chain.buildTransferOffer({ tokenId, owner, transferKey }) };

  await exclusive(product, () => chain.submitTransferOffer({ tokenId, owner, transferKey, signedXdr }));
  const offeredAt = new Date();
  product.transfer = { key, from: owner, offeredAt: offeredAt.toISOString(), expiresAt: new Date(offeredAt.getTime() + TRANSFER_LINK_MS).toISOString() };
  saveState();
  return { warranty: warrantyView(product, baseUrl) };
};

export const cancelTransfer = async (body: JsonBody, baseUrl: string): Promise<Step> => {
  const { product, owner, tokenId } = ownedProduct(body);
  const signedXdr = textField(body, 'signedXdr');
  if (!signedXdr) return { xdr: await chain.buildTransferCancel({ tokenId, owner }) };

  await exclusive(product, () => chain.submitTransferCancel({ tokenId, owner, signedXdr }));
  delete product.transfer;
  saveState();
  return { warranty: warrantyView(product, baseUrl) };
};

// What the link offers, so the recipient sees the product before accepting, and the message to sign with its key.
export const prepareTransfer = async (body: JsonBody): Promise<PreparedTransfer> => {
  const { product, recipient, tokenId } = offeredProduct(body);
  return {
    token: product.token,
    model: product.model,
    from: shortAddress(product.owner),
    message: (await chain.transferMessage(tokenId, recipient)).toString('base64'),
    // An existing account for the payment with which the Cavos kit creates a new user's account.
    feeAccount: chain.issuerAddress(),
    expiresAt: openTransferOf(product)?.expiresAt ?? new Date().toISOString()
  };
};

export const acceptTransfer = async (body: JsonBody, baseUrl: string): Promise<Step> => {
  const { product, recipient, tokenId } = offeredProduct(body);
  const signedXdr = textField(body, 'signedXdr');
  if (!signedXdr) {
    const signature = Buffer.from(textField(body, 'signature'), 'base64');
    if (signature.length !== 64) throw new HttpError(400, 'La firma del link de transferencia no es válida.');
    return { xdr: await chain.buildTransferAccept({ tokenId, recipient, signature }) };
  }

  const txHash = await exclusive(product, () => chain.submitTransferAccept({ tokenId, recipient, signedXdr }));
  const from = product.owner ?? undefined;
  product.owner = recipient;
  delete product.transfer;
  recordEvent(product, { kind: 'transferred', at: new Date().toISOString(), tx: txHash, ...(from ? { from } : {}), to: recipient });
  return { warranty: warrantyView(product, baseUrl) };
};
