import { randomBytes } from 'node:crypto';
import type { HistoryEvent, MintedProduct, ProductStatus, PublicProduct, TransferredWarranty, Warranty } from '../types';
import { isStellarAddress, normalizeId } from '../validation';
import { chain } from './chain';
import { config } from './config';
import { destinationForCountry } from './countries';
import { textField, type JsonBody } from './http';
import { activationUrl, secretUrl, verificationUrl } from './links';
import { singleton } from './singleton';
import { activationKeyFor, explorerTxUrl, isTxHash } from './stellar';
import { hashSecret, saveState, store, type Product, type ProductFields, type StoredEvent } from './store';

const WARRANTY_MONTHS = 12;
const HOUR_MS = 60 * 60 * 1000;
// Public checks of one product counted in its history: one per half day, the latest ones only.
const VERIFIED_EVERY_MS = 12 * HOUR_MS;
const MAX_VERIFIED_EVENTS = 30;
// A transfer link can be accepted for TRANSFER_LINK_MS, and the owner opens the next one TRANSFER_COOLDOWN_MS after the
// last. The contract enforces the same times (TRANSFER_LINK_SECONDS and TRANSFER_COOLDOWN_SECONDS in its lib.rs).
export const TRANSFER_LINK_MS = 15 * 60 * 1000;
export const TRANSFER_COOLDOWN_MS = 5 * 60 * 1000;

// The product's transfer link while it can still be accepted.
export const openTransferOf = (product: Product) => {
  const { transfer } = product;
  if (!transfer) return null;
  const expiresAt = transfer.expiresAt ?? new Date(new Date(transfer.offeredAt).getTime() + TRANSFER_LINK_MS).toISOString();
  return Date.now() <= new Date(expiresAt).getTime() ? { ...transfer, expiresAt } : null;
};

// When the owner may open another link, or null if they can now.
export const nextTransferAt = (product: Product) => {
  if (!product.lastTransferOfferAt) return null;
  const next = new Date(product.lastTransferOfferAt).getTime() + TRANSFER_COOLDOWN_MS;
  return next > Date.now() ? new Date(next).toISOString() : null;
};

const warrantyUntil = (claimedAt: string | undefined) => {
  if (!claimedAt) return null;
  const date = new Date(claimedAt);
  date.setUTCMonth(date.getUTCMonth() + WARRANTY_MONTHS);
  return date.toISOString();
};

const statusOf = (product: Product): ProductStatus => (product.claimed ? 'CLAIMED_IN_WARRANTY' : 'SEALED');

export const findProduct = (token: unknown) => store.products.get(normalizeId(token));

// Registered in the contract this server uses now, not only in one that a later deploy replaced.
export const isCurrentOnChain = (product: Product): product is Product & { chain: NonNullable<Product['chain']> } =>
  Boolean(product.chain && config.contractId && (product.chain.contractId ?? config.previousContractId ?? config.contractId) === config.contractId);

export const shortAddress = (address: string | undefined | null) => (address ? `${address.slice(0, 4)}…${address.slice(-4)}` : 'desconocido');
const txUrlOf = (tx: string | undefined) => (isTxHash(tx) ? explorerTxUrl(tx) : null);

// Whoever activated the warranty: the first transfer's previous owner, or the current owner if it never moved.
const firstOwner = (product: Product) => product.events?.find((event) => event.kind === 'transferred')?.from ?? product.owner;

const storedEventView = (product: Product, event: StoredEvent): HistoryEvent => {
  const details: Record<StoredEvent['kind'], string | null> = {
    shipped: `Destino ${product.destination}`,
    verified: null,
    rejected: 'El producto ya tenía dueño: el QR secreto pudo haber sido copiado',
    transferred: `Dueño anterior: ${shortAddress(event.from)}`
  };
  return {
    kind: event.kind, at: event.at, detail: details[event.kind], txUrl: txUrlOf(event.tx),
    to: event.kind === 'transferred' ? shortAddress(event.to) : null
  };
};

const transfersOf = (product: Product) => (product.events ?? []).filter((event) => event.kind === 'transferred');

// Oldest first. Registration and activation come from the product itself, so older products have a history too.
export const historyOf = (product: Product): HistoryEvent[] => {
  const history: HistoryEvent[] = [];
  const registeredAt = product.createdAt ?? product.chain?.at;
  if (registeredAt) {
    history.push({ kind: 'minted', at: registeredAt, detail: `Lote ${product.lot}`, txUrl: isCurrentOnChain(product) ? txUrlOf(product.chain?.mintTx) : null, to: null });
  }
  if (product.claimed && product.claimedAt) {
    history.push({ kind: 'activated', at: product.claimedAt, detail: `Dueño ${shortAddress(firstOwner(product))}`, txUrl: txUrlOf(product.claimTransaction), to: null });
  }
  for (const event of product.events ?? []) history.push(storedEventView(product, event));
  return history.sort((first, second) => first.at.localeCompare(second.at));
};

export const recordEvent = (product: Product, event: StoredEvent) => {
  (product.events ??= []).push(event);
  saveState();
};

// Each public check of the product, at most one every VERIFIED_EVERY_MS so reloading the page adds nothing.
export const recordVerification = (product: Product) => {
  const events = product.events ?? [];
  const last = events.findLast((event) => event.kind === 'verified');
  if (last && Date.now() - new Date(last.at).getTime() < VERIFIED_EVERY_MS) return;
  const verified = events.filter((event) => event.kind === 'verified');
  if (verified.length >= MAX_VERIFIED_EVENTS) product.events = events.filter((event) => event !== verified[0]);
  recordEvent(product, { kind: 'verified', at: new Date().toISOString() });
};

// Someone with the secret QR tried to activate a product that already has an owner: a sign of a copied label.
// Once a day per account, since a single attempt goes through several requests.
export const recordRejectedClaim = (product: Product, claimant: string) => {
  const recent = product.events?.some((event) => event.kind === 'rejected' && event.by === claimant && Date.now() - new Date(event.at).getTime() < 24 * HOUR_MS);
  if (!recent) recordEvent(product, { kind: 'rejected', at: new Date().toISOString(), by: claimant });
};

export const publicProductView = (product: Product): PublicProduct => ({
  token: product.token,
  model: product.model,
  lot: product.lot,
  destination: product.destination,
  status: statusOf(product),
  claimed: product.claimed,
  claimedAt: product.claimedAt ?? null,
  warrantyUntil: warrantyUntil(product.claimedAt),
  network: config.network,
  // True only for products registered in the contract, not merely because a contract is configured.
  blockchainBacked: isCurrentOnChain(product),
  history: historyOf(product),
  lastTransfer: (() => {
    const last = transfersOf(product).at(-1);
    return last ? { to: shortAddress(last.to), at: last.at } : null;
  })()
});

// Products this account passed on and no longer owns, the latest first. When it owned one twice, the last time counts.
export const transferredBy = (owner: string): TransferredWarranty[] =>
  [...store.products.values()]
    .filter((product) => product.owner !== owner)
    .flatMap((product) => {
      const given = transfersOf(product).findLast((event) => event.from === owner);
      return given ? [{
        token: product.token,
        model: product.model,
        to: shortAddress(given.to),
        at: given.at,
        txUrl: txUrlOf(given.tx),
        history: historyOf(product)
      }] : [];
    })
    .sort((first, second) => second.at.localeCompare(first.at));

// What the buyer may see is the certification only: the activation transaction signed by the issuing account.
// The Cosmos Pay payment that bought the batch moves company money and never leaves the company panel.
export const warrantyView = (product: Product, baseUrl: string): Warranty => ({
  ...publicProductView(product),
  certificateUrl: isTxHash(product.claimTransaction) ? explorerTxUrl(product.claimTransaction) : null,
  tokenId: product.tokenId,
  owner: product.owner,
  verificationUrl: verificationUrl(baseUrl, product.token),
  activationUrl: activationUrl(baseUrl),
  contractId: config.contractId,
  chainTokenId: isCurrentOnChain(product) ? product.chain?.tokenId ?? null : null,
  transferable: product.claimed && isCurrentOnChain(product),
  transferOfferedAt: openTransferOf(product)?.offeredAt ?? null,
  transferExpiresAt: openTransferOf(product)?.expiresAt ?? null,
  nextTransferAt: nextTransferAt(product)
});

export const mintedProductView = (product: Product, baseUrl: string): MintedProduct => ({
  ...warrantyView(product, baseUrl),
  ...(product.secretCode ? { secretCode: product.secretCode, secretUrl: secretUrl(baseUrl, product.secretCode) } : {})
});

export const readProductFields = (body: JsonBody): ProductFields | null => {
  const fields = {
    model: (textField(body, 'model') || textField(body, 'name')).trim(),
    lot: textField(body, 'lot').trim(),
    // The market comes from the list of countries, and the server (not the browser) turns it into the destination
    // printed on the labels. Free text is still accepted for batches created before the list existed.
    destination: destinationForCountry(body['country']) || textField(body, 'destination').trim()
  };
  const valid = fields.model && fields.model.length <= 120
    && fields.lot && fields.lot.length <= 60
    && fields.destination && fields.destination.length <= 40;
  return valid ? fields : null;
};

export const mintProduct = (fields: ProductFields & { batchId?: string }) => {
  const tokenId = store.nextTokenId++;
  const token = `VF-${String(tokenId).padStart(3, '0')}`;
  const secretCode = `VF-SECRET-${randomBytes(10).toString('hex').toUpperCase()}`;
  const product: Product = {
    tokenId, token, ...fields, secretCode, secretHash: hashSecret(secretCode), claimed: false, owner: null, createdAt: new Date().toISOString()
  };
  store.products.set(token, product);
  return product;
};

// Key the browser derives from the QR to find its product without sending the secret. The seed product has no
// secret code, so it keeps the local demo claim.
export const activationKeyOf = (product: Product) => {
  if (!product.secretCode) return '';
  product.activationKey ||= activationKeyFor(product.secretCode).toString('hex');
  return product.activationKey;
};

// Products still waiting to be registered in the current contract: new ones, and after a new deploy every product of
// the replaced contract. Activated ones are carried over with their owner.
export const isPendingOnChain = (product: Product) =>
  Boolean(product.secretCode) && !isCurrentOnChain(product) && (!product.claimed || isStellarAddress(product.owner));

// Registers pending products in the Stellar contract, one transaction each. A failure is logged and retried on the
// next pass: new products, a claim attempt for an unregistered product, or a server restart.
const anchoring = singleton('anchoring', () => ({ running: false, again: false }));

export const anchorPendingProducts = () => {
  if (!chain.enabled) return;
  if (anchoring.running) {
    anchoring.again = true;
    return;
  }
  anchoring.running = true;
  void (async () => {
    do {
      anchoring.again = false;
      for (const product of [...store.products.values()].filter(isPendingOnChain)) {
        try {
          const toMint = { ...product, secretCode: product.secretCode ?? '' };
          const registered = product.claimed && product.owner
            ? await chain.importClaimedProduct(toMint, product.owner)
            : await chain.mintProduct(toMint);
          product.chain = { ...registered, contractId: chain.contractId, at: new Date().toISOString() };
          // A link opened in the replaced contract does not exist in the new one.
          delete product.transfer;
          saveState();
        } catch (error) {
          console.error(`No se pudo registrar ${product.token} en Stellar:`, error instanceof Error ? error.message : error);
        }
      }
    } while (anchoring.again);
  })().finally(() => {
    anchoring.running = false;
  });
};

// Products whose registration failed or was interrupted by a restart are retried as soon as the server loads this
// module, which happens with the first request that reads products.
singleton('anchoring-on-start', () => {
  anchorPendingProducts();
  if (!chain.enabled) console.info('Sin STELLAR_CONTRACT_ID: las garantías se guardan solo en este servidor (modo demo).');
  else console.info(`Garantías registradas en el contrato Stellar ${config.contractId}`);
  return true;
});
