import { randomBytes } from 'node:crypto';
import type { MintedProduct, ProductStatus, PublicProduct, Warranty } from '../types';
import { normalizeId } from '../validation';
import { chain } from './chain';
import { config } from './config';
import { destinationForCountry } from './countries';
import { textField, type JsonBody } from './http';
import { activationUrl, secretUrl, verificationUrl } from './links';
import { singleton } from './singleton';
import { activationKeyFor, explorerTxUrl, isTxHash } from './stellar';
import { hashSecret, saveState, store, type Product, type ProductFields } from './store';

const WARRANTY_MONTHS = 12;

const warrantyUntil = (claimedAt: string | undefined) => {
  if (!claimedAt) return null;
  const date = new Date(claimedAt);
  date.setUTCMonth(date.getUTCMonth() + WARRANTY_MONTHS);
  return date.toISOString();
};

const statusOf = (product: Product): ProductStatus => (product.claimed ? 'CLAIMED_IN_WARRANTY' : 'SEALED');

export const findProduct = (token: unknown) => store.products.get(normalizeId(token));

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
  blockchainBacked: Boolean(product.chain)
});

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
  chainTokenId: product.chain?.tokenId ?? null
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

// Unclaimed products still waiting to be registered in the contract.
export const isPendingOnChain = (product: Product) => Boolean(product.secretCode) && !product.chain && !product.claimed;

// Registers unclaimed products in the Stellar contract, one transaction each. A failure is logged and retried on the
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
          product.chain = await chain.mintProduct({ ...product, secretCode: product.secretCode ?? '' });
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
