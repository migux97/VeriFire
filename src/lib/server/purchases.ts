import { parseIssuanceOptions } from '../issuance';
// Company purchases: a batch of products is paid with Cosmos Pay and minted once the payment is confirmed.
import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from '@cosmosapp/pay_sdk';
import type { CompanyBatch, CreatedPurchase, PublicBatch, PurchaseStatus, PurchaseSummary } from '../types';
import { isStellarAddress, normalizeId } from '../validation';
import { chain } from './chain';
import { config } from './config';
import { HttpError } from './errors';
import { textField, type JsonBody } from './http';
import { batchUrl, qrImage, secretUrl, verificationUrl } from './links';
import { anchorPendingProducts, isCurrentOnChain, isPendingOnChain, mintProduct, readProductFields } from './products';
import { explorerTxUrl, isTxHash } from './stellar';
import { saveState, store, type Batch, type Purchase } from './store';
import { parseSupport } from './support';

const MAX_QUANTITY = 500;

const cosmosPay = () => new Client({ apiKey: config.cosmosPay.apiKey });

// The placeholders of .env.example (dv_REPLACE..., G_REPLACE...) count as not configured, like an empty value.
export const paymentsConfigured = () => {
  const { apiKey, destination } = config.cosmosPay;
  return Boolean(apiKey && destination && !apiKey.includes('REPLACE') && !destination.includes('REPLACE'));
};

// Cosmos Pay picks the network from the key: prod_ keys charge on the public network, dv_ keys on testnet.
export const paymentNetwork = (): 'public' | 'testnet' => (config.cosmosPay.apiKey.startsWith('prod_') ? 'public' : 'testnet');

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
  // The company's warranty settings at the time of buying; it can change them later for all its batches.
  const support = parseSupport(body['support']);
  const total = (Number(config.cosmosPay.amountPerToken) * quantity).toFixed(2);
  const intent = await cosmosPay().paymentIntents.createPay({
    destination: config.cosmosPay.destination,
    amount: total,
    msg: `Verifire emisión ${quantity} tokens ${fields.model}`
  });
  const purchaseId = `PUR-${randomUUID()}`;
  // Sent by the panel when its wallet is at hand: from then on the batch is found by signing with that wallet.
  const owner = textField(body, 'owner').trim();
  // The payment QR is kept so a pending purchase can be reopened from the company's list of batches.
  store.purchases.set(purchaseId, {
    purchaseId, quantity, ...fields, ...(configuration ? { configuration } : {}), ...(support ? { support } : {}), total, intentId: intent.id,
    ...(isStellarAddress(owner) ? { owner } : {}),
    createdAt: new Date().toISOString(), paymentQr: intent.qr || null, paymentUri: intent.uri || null
  });
  try {
    saveState();
  } catch (error) {
    // The client never learns its id, so nobody could ever pay or find it: it is not kept.
    store.purchases.delete(purchaseId);
    throw error;
  }
  return {
    purchaseId,
    quantity,
    amount: total,
    asset: intent.asset || 'XLM',
    intentId: intent.id,
    status: intent.status,
    // The key decides the network (dv_ testnet, prod_ public); the intent's own label may use other names.
    network: paymentNetwork(),
    uri: intent.uri,
    qr: intent.qr
  };
};

// Idempotent: concurrent status checks for the same purchase create a single batch.
const finalizePurchase = (purchase: Purchase, txHash: string | null) => {
  if (!purchase.batchId) {
    // Random, like the product codes: the batch page is public, and numbered ids let anyone list every batch.
    store.nextBatchId++;
    let batchId: string;
    do batchId = `BATCH-${randomBytes(5).toString('hex').toUpperCase()}`;
    while (store.batches.has(batchId));
    const { model, lot, destination } = purchase;
    const tokens = Array.from({ length: purchase.quantity }, () => mintProduct({ model, lot, destination, batchId }));
    store.batches.set(batchId, { batchId, tokens, model, lot, destination, amount: purchase.total, txHash, ...(purchase.configuration ? { configuration: purchase.configuration } : {}), ...(purchase.support ? { support: purchase.support } : {}) });
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
    payment: purchase.batchId ? null : { qr: purchase.paymentQr ?? null, uri: purchase.paymentUri ?? null, network: paymentNetwork() },
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

// A payment sent from a browser wallet: Cosmos Pay checks the transaction (destination, amount and memo) and marks the
// intent as paid, so the batch is issued right away instead of waiting for Cosmos Pay to find it on its own.
export const confirmWalletPayment = async (purchase: Purchase, txHash: string, baseUrl: string) => {
  if (!isTxHash(txHash)) throw new HttpError(400, 'La transacción del pago no es válida.');
  // Cosmos Pay usually sees the payment on its own within seconds; validating an intent already paid is refused.
  const status = await purchaseStatus(purchase, { summaryOnly: true, baseUrl });
  if (status.succeeded) return status;
  try {
    await cosmosPay().paymentIntents.validate(purchase.intentId, { txHash });
  } catch (error) {
    // Paid meanwhile, or not on the ledger yet: the list keeps checking the purchase either way.
    console.error('Cosmos validate error:', error instanceof Error ? error.message : error);
  }
  return purchaseStatus(purchase, { summaryOnly: true, baseUrl });
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
