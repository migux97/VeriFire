import { parseIssuanceOptions } from '../issuance';
// Company purchases: a batch of products is paid with Cosmos Pay and minted once the payment is confirmed.
import { randomUUID } from 'node:crypto';
import { Client } from '@cosmosapp/pay_sdk';
import type { CompanyBatch, CreatedPurchase, PublicBatch, PurchaseStatus, PurchaseSummary } from '../types';
import { normalizeId } from '../validation';
import { chain } from './chain';
import { config } from './config';
import { HttpError } from './errors';
import type { JsonBody } from './http';
import { batchUrl, qrImage, secretUrl, verificationUrl } from './links';
import { anchorPendingProducts, isCurrentOnChain, isPendingOnChain, mintProduct, readProductFields } from './products';
import { explorerTxUrl, isTxHash } from './stellar';
import { saveState, store, type Batch, type Purchase } from './store';

const MAX_QUANTITY = 500;

const cosmosPay = () => new Client({ apiKey: config.cosmosPay.apiKey });

export const paymentsConfigured = () => {
  const { apiKey, destination } = config.cosmosPay;
  return Boolean(apiKey && destination && !destination.startsWith('G_REPLACE'));
};

export const findBatch = (batchId: unknown) => store.batches.get(normalizeId(batchId));
export const findPurchase = (purchaseId: string) => store.purchases.get(purchaseId);

const batchBase = (batch: Batch, baseUrl: string) => ({
  batchId: batch.batchId,
  quantity: batch.tokens.length,
  model: batch.model,
  lot: batch.lot,
  destination: batch.destination,
  publicUrl: batchUrl(baseUrl, batch.batchId),
  network: config.network,
  blockchainBacked: chain.enabled
});

export const publicBatchView = (batch: Batch, baseUrl: string): PublicBatch => ({
  ...batchBase(batch, baseUrl),
  tokens: batch.tokens.map((product) => ({ token: product.token, status: product.claimed ? 'CLAIMED_IN_WARRANTY' : 'SEALED' }))
});

// Each product gets a public QR for the outside of the box and a secret QR for the inside.
export const companyBatchView = async (batch: Batch, baseUrl: string): Promise<CompanyBatch> => {
  const base = batchBase(batch, baseUrl);
  const tokens = await Promise.all(batch.tokens.map(async (product) => {
    const secretCode = product.secretCode ?? '';
    const productSecretUrl = secretUrl(baseUrl, secretCode);
    const publicUrl = verificationUrl(baseUrl, product.token);
    const [secretQr, publicQr] = await Promise.all([qrImage(productSecretUrl), qrImage(publicUrl)]);
    return {
      token: product.token,
      status: product.claimed ? 'CLAIMED_IN_WARRANTY' as const : 'SEALED' as const,
      secretCode,
      secretUrl: productSecretUrl,
      secretQr,
      publicUrl,
      publicQr
    };
  }));
  return {
    ...base,
    ...(batch.configuration ? { configuration: batch.configuration } : {}),
    publicQr: await qrImage(base.publicUrl),
    tokens,
    payment: { amount: batch.amount, asset: 'XLM', pricePerToken: config.cosmosPay.amountPerToken }
  };
};

export const createBatchPayment = async (body: JsonBody): Promise<CreatedPurchase> => {
  const quantity = Number(body['quantity']);
  const fields = readProductFields(body);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY || !fields) {
    throw new HttpError(400, `Indica una cantidad entre 1 y ${MAX_QUANTITY}, modelo, lote y destino.`);
  }

  let configuration;
  try { configuration = parseIssuanceOptions(body['configuration']); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Configuración inválida.'); }
  const total = (Number(config.cosmosPay.amountPerToken) * quantity).toFixed(2);
  const intent = await cosmosPay().paymentIntents.createPay({
    destination: config.cosmosPay.destination,
    amount: total,
    msg: `Verifire emisión ${quantity} tokens ${fields.model}`
  });
  const purchaseId = `PUR-${randomUUID()}`;
  // The payment QR is kept so a pending purchase can be reopened from the company's list of batches.
  store.purchases.set(purchaseId, {
    purchaseId, quantity, ...fields, ...(configuration ? { configuration } : {}), total, intentId: intent.id,
    createdAt: new Date().toISOString(), paymentQr: intent.qr || null, paymentUri: intent.uri || null
  });
  saveState();
  return {
    purchaseId,
    quantity,
    amount: total,
    asset: intent.asset || 'XLM',
    intentId: intent.id,
    status: intent.status,
    network: intent.network,
    uri: intent.uri,
    qr: intent.qr
  };
};

// Idempotent: concurrent status checks for the same purchase create a single batch.
const finalizePurchase = (purchase: Purchase, txHash: string | null) => {
  if (!purchase.batchId) {
    const batchId = `BATCH-${String(store.nextBatchId++).padStart(4, '0')}`;
    const { model, lot, destination } = purchase;
    const tokens = Array.from({ length: purchase.quantity }, () => mintProduct({ model, lot, destination, batchId }));
    store.batches.set(batchId, { batchId, tokens, model, lot, destination, amount: purchase.total, txHash, ...(purchase.configuration ? { configuration: purchase.configuration } : {}) });
    Object.assign(purchase, { batchId, txHash });
    saveState();
    // Registers the new products in the contract in the background; the QR sheet does not wait for it.
    anchorPendingProducts();
  }
};

const purchaseSummary = (purchase: Purchase): PurchaseSummary => {
  const tokens = (purchase.batchId && store.batches.get(purchase.batchId)?.tokens) || [];
  return {
    purchaseId: purchase.purchaseId,
    model: purchase.model,
    lot: purchase.lot,
    destination: purchase.destination,
    quantity: purchase.quantity,
    amount: purchase.total,
    asset: 'XLM',
    // Purchases made before createdAt was stored use the date their products were created.
    createdAt: purchase.createdAt ?? tokens[0]?.createdAt ?? null,
    batchId: purchase.batchId ?? null,
    payment: purchase.batchId ? null : { qr: purchase.paymentQr ?? null, uri: purchase.paymentUri ?? null },
    issuanceTxUrl: isTxHash(purchase.txHash) ? explorerTxUrl(purchase.txHash) : null,
    registeredOnChain: tokens.filter(isCurrentOnChain).length,
    pendingOnChain: chain.enabled ? tokens.filter(isPendingOnChain).length : 0,
    claimed: tokens.filter((product) => product.claimed).length,
    shippedAt: (purchase.batchId && store.batches.get(purchase.batchId)?.shippedAt) || null
  };
};

// Once per batch: every product records the shipment to the batch's destination in its history.
export const shipBatch = (purchase: Purchase) => {
  const batch = purchase.batchId ? store.batches.get(purchase.batchId) : undefined;
  if (!batch) throw new HttpError(409, 'Este lote todavía no existe: falta confirmar el pago.');
  if (!batch.shippedAt) {
    batch.shippedAt = new Date().toISOString();
    for (const product of batch.tokens) (product.events ??= []).push({ kind: 'shipped', at: batch.shippedAt });
    saveState();
  }
  return { purchase: purchaseSummary(purchase) };
};

// Checks the payment and returns the batch with its secret codes and QR images. With summaryOnly it returns only
// the summary, for the list of batches.
export const purchaseStatus = async (purchase: Purchase, { summaryOnly, baseUrl }: { summaryOnly: boolean; baseUrl: string }): Promise<PurchaseStatus> => {
  if (!purchase.batchId) {
    let intent;
    try {
      intent = await cosmosPay().paymentIntents.fetch(purchase.intentId);
    } catch (error) {
      // The list still shows a pending purchase when Cosmos Pay cannot be reached; the next check retries.
      if (!summaryOnly) throw error;
      console.error('Cosmos status error (summary):', error instanceof Error ? error.message : error);
      return { status: 'unknown', succeeded: false, purchase: purchaseSummary(purchase) };
    }
    if (!intent.isSucceeded) {
      return { status: intent.status, succeeded: false, txHash: intent.txHash || null, purchase: purchaseSummary(purchase) };
    }
    finalizePurchase(purchase, intent.txHash || null);
  }
  const batch = purchase.batchId ? store.batches.get(purchase.batchId) : undefined;
  return {
    status: 'succeeded',
    succeeded: true,
    paymentValidated: true,
    purchase: purchaseSummary(purchase),
    ...(summaryOnly || !batch ? {} : { batch: await companyBatchView(batch, baseUrl) })
  };
};
