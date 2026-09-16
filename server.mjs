import 'dotenv/config';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Client } from '@cosmosapp/pay_sdk';
import QRCode from 'qrcode';
import { countries, destinationForCountry } from './countries.mjs';
import {
  activationKeyFor, activationMessage, adminAddress, buildActivation, chainEnabled, explorerTxUrl, isTxHash, mintOnChain, submitActivation
} from './stellar.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 5501);
const apiKey = process.env.COSMOS_PAY_API_KEY;
const paymentDestination = process.env.COSMOS_PAY_DESTINATION;
const amount = process.env.COSMOS_PAY_AMOUNT || '5';
const cavosAppId = process.env.CAVOS_APP_ID || '';
const adminApiToken = process.env.ADMIN_API_TOKEN || '';
const corsOrigin = process.env.CORS_ORIGIN || '';
const publicAppUrl = (process.env.PUBLIC_APP_URL || `http://localhost:${port}`).replace(/\/$/, '');
const network = process.env.STELLAR_NETWORK || 'local-demo';
const contractId = process.env.STELLAR_CONTRACT_ID || null;
const maxBodyBytes = 64 * 1024;
const stateFile = process.env.DATA_FILE || join(root, 'data', 'verifire-state.json');
const publicFiles = new Set([
  '/index.html', '/app.html', '/admin.html', '/batch.html', '/verify.html',
  '/common.js', '/auth.js', '/app.js', '/admin.js', '/batch.js', '/verify.js',
  '/lotes.html', '/lotes.js', '/favicon.svg',
  '/cavos.bundle.mjs', '/buffer.bundle.js', '/personal.css'
]);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
// Browser libraries served straight from node_modules.
const vendorFiles = { '/vendor/jsQR.js': 'node_modules/jsqr/dist/jsQR.js' };

const hashSecret = (secret) => createHash('sha256').update(secret).digest('hex');
const normalizeId = (value) => String(value || '').trim().toUpperCase();
const isStellarAddress = (value) => /^G[A-Z2-7]{55}$/.test(value);

const WARRANTY_MONTHS = 12;
const warrantyUntil = (claimedAt) => {
  if (!claimedAt) return null;
  const date = new Date(claimedAt);
  date.setUTCMonth(date.getUTCMonth() + WARRANTY_MONTHS);
  return date.toISOString();
};

const purchases = new Map();
const batches = new Map();
const products = new Map([
  ['VF-001', {
    tokenId: 1,
    token: 'VF-001',
    model: 'Smartwatch X9 Pro',
    lot: '1043',
    destination: 'Argentina · LATAM',
    secretHash: hashSecret('VF-SECRET-DEMO-001'),
    claimed: false,
    owner: null
  }]
]);
let nextTokenId = 2;
let nextBatchId = 1;

const saveState = () => {
  const state = {
    nextTokenId,
    nextBatchId,
    products: [...products.values()],
    batches: [...batches.values()].map((batch) => ({ ...batch, tokens: batch.tokens.map((product) => product.token) })),
    purchases: [...purchases.values()]
  };
  try {
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('No se pudo guardar el estado de Verifire:', error);
  }
};

const loadState = () => {
  let state;
  try {
    state = JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw new Error(`No se pudo leer ${stateFile}. Revisalo o borralo antes de iniciar el servidor.`, { cause: error });
  }
  for (const product of state.products || []) products.set(product.token, product);
  for (const batch of state.batches || []) {
    batches.set(batch.batchId, { ...batch, tokens: batch.tokens.map((token) => products.get(token)).filter(Boolean) });
  }
  for (const purchase of state.purchases || []) purchases.set(purchase.purchaseId, purchase);
  nextTokenId = Math.max(nextTokenId, Number(state.nextTokenId) || 0);
  nextBatchId = Math.max(nextBatchId, Number(state.nextBatchId) || 0);
};

loadState();

const getClient = () => new Client({ apiKey });

const sendJson = (response, status, body) => {
  response.writeHead(status, {
    ...(corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin } : {}),
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(body));
};

const isAdminRequest = (request) => {
  if (!adminApiToken) return false;
  const provided = Buffer.from(String(request.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(adminApiToken);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
};

// Errors with `expose: true` carry a status and a message that are safe to show to the client.
const requestError = (status, message) => Object.assign(new Error(message), { status, expose: true });

const sendError = (response, error, fallbackStatus, fallbackMessage, logLabel) => {
  if (error.expose) {
    sendJson(response, error.status, { error: error.message });
    return;
  }
  console.error(logLabel, error);
  sendJson(response, fallbackStatus, { error: fallbackMessage });
};

const readJson = async (request) => {
  const tooLarge = () => requestError(413, 'El cuerpo de la solicitud es demasiado grande.');
  if (Number(request.headers['content-length'] || 0) > maxBodyBytes) throw tooLarge();

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw tooLarge();
    chunks.push(chunk);
  }
  if (!size) return {};

  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw requestError(400, 'El cuerpo de la solicitud no es JSON válido.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw requestError(400, 'El cuerpo de la solicitud debe ser un objeto JSON.');
  }
  return body;
};

const appUrl = (page, params) => `${publicAppUrl}/${page}?${new URLSearchParams(params)}`;
// Secret QR links carry an opaque key instead of the readable code: the 10 random bytes of
// VF-SECRET-<hex> in base64url, or "." + base64url for any other code. It goes after the #,
// so browsers never send it to the server when the page is requested.
const SECRET_PATTERN = /^VF-SECRET-([0-9A-F]{20})$/;
const qrKeyFor = (secretCode) => {
  const match = SECRET_PATTERN.exec(secretCode);
  return match ? Buffer.from(match[1], 'hex').toString('base64url') : `.${Buffer.from(secretCode).toString('base64url')}`;
};
const secretFromQrKey = (key) => {
  const value = String(key || '');
  if (value.startsWith('.')) return Buffer.from(value.slice(1), 'base64url').toString('utf8');
  const bytes = Buffer.from(value, 'base64url');
  return bytes.length === 10 ? `VF-SECRET-${bytes.toString('hex').toUpperCase()}` : '';
};
const secretUrlFor = (product) => `${publicAppUrl}/app.html#q=${qrKeyFor(product.secretCode)}`;
// QR images are generated here: secret codes must never be sent to a third-party QR service.
const qrImage = async (text) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }))}`;
const statusOf = (product) => (product.claimed ? 'CLAIMED_IN_WARRANTY' : 'SEALED');

const productResponse = (product, includeSecret = false) => {
  const verificationUrl = appUrl('verify.html', { token: product.token });
  // What the buyer may see is the certification only: the activation transaction signed by the issuing account.
  // The Cosmos Pay payment that bought the batch moves company money and never leaves the company panel.
  return {
    certificateUrl: isTxHash(product.claimTransaction) ? explorerTxUrl(product.claimTransaction) : null,
    tokenId: product.tokenId,
    token: product.token,
    model: product.model,
    lot: product.lot,
    destination: product.destination,
    status: statusOf(product),
    claimed: product.claimed,
    owner: product.owner,
    claimedAt: product.claimedAt || null,
    warrantyUntil: warrantyUntil(product.claimedAt),
    verificationUrl,
    activationUrl: `${publicAppUrl}/app.html`,
    network,
    contractId,
    // True only for products registered in the contract, not merely because a contract is configured.
    blockchainBacked: Boolean(product.chain),
    chainTokenId: product.chain?.tokenId ?? null,
    ...(includeSecret ? { secretCode: product.secretCode, secretUrl: secretUrlFor(product) } : {})
  };
};

// What the QR on the outside of the box shows to anyone, without a session: no owner and no links.
const publicProductResponse = (product) => ({
  token: product.token,
  model: product.model,
  lot: product.lot,
  destination: product.destination,
  status: statusOf(product),
  claimed: product.claimed,
  claimedAt: product.claimedAt || null,
  warrantyUntil: warrantyUntil(product.claimedAt),
  network,
  blockchainBacked: Boolean(product.chain)
});

const batchResponse = async (batch, includeSecrets = false) => {
  const publicUrl = appUrl('batch.html', { batch: batch.batchId });
  const tokens = await Promise.all(batch.tokens.map(async (product) => {
    const token = { token: product.token, status: statusOf(product) };
    if (!includeSecrets) return token;
    // Each product gets a public QR for the outside of the box and a secret QR for the inside.
    const secretUrl = secretUrlFor(product);
    const productUrl = appUrl('verify.html', { token: product.token });
    const [secretQr, publicQr] = await Promise.all([qrImage(secretUrl), qrImage(productUrl)]);
    return { ...token, secretCode: product.secretCode, secretUrl, secretQr, publicUrl: productUrl, publicQr };
  }));
  return {
    batchId: batch.batchId,
    quantity: batch.tokens.length,
    model: batch.model,
    lot: batch.lot,
    destination: batch.destination,
    publicUrl,
    ...(includeSecrets ? { publicQr: await qrImage(publicUrl) } : {}),
    tokens,
    // What the batch cost is company data: it travels only with the secret codes, never on the public lot page.
    ...(includeSecrets ? { payment: { amount: batch.amount, asset: 'XLM', pricePerToken: amount } } : {}),
    network,
    blockchainBacked: chainEnabled()
  };
};

const readProductFields = (body) => {
  const fields = {
    model: String(body.model || body.name || '').trim(),
    lot: String(body.lot || '').trim(),
    // The market comes from the list of countries, and the server (not the browser) turns it into the destination
    // printed on the labels. Free text is still accepted for batches created before the list existed.
    destination: destinationForCountry(body.country) || String(body.destination || '').trim()
  };
  const valid = fields.model && fields.model.length <= 120
    && fields.lot && fields.lot.length <= 60
    && fields.destination && fields.destination.length <= 40;
  return valid ? fields : null;
};

const mintProduct = (fields) => {
  const tokenId = nextTokenId++;
  const token = `VF-${String(tokenId).padStart(3, '0')}`;
  const secretCode = `VF-SECRET-${randomBytes(10).toString('hex').toUpperCase()}`;
  const product = { tokenId, token, ...fields, secretCode, secretHash: hashSecret(secretCode), claimed: false, owner: null, createdAt: new Date().toISOString() };
  products.set(token, product);
  return product;
};

// Key the browser derives from the QR to find its product without sending the secret. The seed product has no
// secret code, so it keeps the local demo claim.
const activationKeyOf = (product) => {
  if (!product.secretCode) return '';
  product.activationKey ||= activationKeyFor(product.secretCode).toString('hex');
  return product.activationKey;
};

// Registers unclaimed products in the Stellar contract, one transaction each. A failure is logged and retried on
// the next pass: new products, a claim attempt for an unregistered product, or a server restart.
let anchoring = null;
let anchorAgain = false;
const anchorPendingProducts = () => {
  if (!chainEnabled()) return;
  if (anchoring) {
    anchorAgain = true;
    return;
  }
  anchoring = (async () => {
    do {
      anchorAgain = false;
      for (const product of [...products.values()].filter((candidate) => candidate.secretCode && !candidate.chain && !candidate.claimed)) {
        try {
          product.chain = await mintOnChain(product);
          saveState();
        } catch (error) {
          console.error(`No se pudo registrar ${product.token} en Stellar:`, error.message);
        }
      }
    } while (anchorAgain);
  })().finally(() => {
    anchoring = null;
  });
};

const createBatchPayment = async (request, response) => {
  if (!apiKey || !paymentDestination || paymentDestination.startsWith('G_REPLACE')) {
    sendJson(response, 503, { error: 'Configura COSMOS_PAY_API_KEY y COSMOS_PAY_DESTINATION para usar pagos de prueba.' });
    return;
  }

  try {
    const body = await readJson(request);
    const quantity = Number(body.quantity);
    const fields = readProductFields(body);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500 || !fields) {
      sendJson(response, 400, { error: 'Indica una cantidad entre 1 y 500, modelo, lote y destino.' });
      return;
    }

    const total = (Number(amount) * quantity).toFixed(2);
    const intent = await getClient().paymentIntents.createPay({
      destination: paymentDestination,
      amount: total,
      msg: `Verifire emisión ${quantity} tokens ${fields.model}`
    });
    const purchaseId = `PUR-${randomUUID()}`;
    // The payment QR is kept so a pending purchase can be reopened from the company's list of batches.
    purchases.set(purchaseId, {
      purchaseId, quantity, ...fields, total, intentId: intent.id,
      createdAt: new Date().toISOString(), paymentQr: intent.qr || null, paymentUri: intent.uri || null
    });
    saveState();
    sendJson(response, 201, {
      purchaseId,
      quantity,
      amount: total,
      asset: intent.asset || 'XLM',
      intentId: intent.id,
      status: intent.status,
      network: intent.network,
      uri: intent.uri,
      qr: intent.qr
    });
  } catch (error) {
    sendError(response, error, 502, 'No se pudo crear el pago de la emisión.', 'Cosmos batch payment error:');
  }
};

// Idempotent: concurrent status checks for the same purchase create a single batch.
const finalizePurchase = (purchase, txHash) => {
  if (!purchase.batchId) {
    const batchId = `BATCH-${String(nextBatchId++).padStart(4, '0')}`;
    const { model, lot, destination } = purchase;
    const tokens = Array.from({ length: purchase.quantity }, () => mintProduct({ model, lot, destination, batchId }));
    batches.set(batchId, { batchId, tokens, model, lot, destination, amount: purchase.total, txHash });
    Object.assign(purchase, { batchId, txHash });
    saveState();
    // Registers the new products in the contract in the background; the QR sheet does not wait for it.
    anchorPendingProducts();
  }
  return batches.get(purchase.batchId);
};

// What the company's list of batches shows for a purchase: no secret codes and no QR images.
const purchaseSummary = (purchase) => {
  const tokens = batches.get(purchase.batchId)?.tokens || [];
  return {
    purchaseId: purchase.purchaseId,
    model: purchase.model,
    lot: purchase.lot,
    destination: purchase.destination,
    quantity: purchase.quantity,
    amount: purchase.total,
    asset: 'XLM',
    // Purchases made before createdAt was stored use the date their products were created.
    createdAt: purchase.createdAt || tokens[0]?.createdAt || null,
    batchId: purchase.batchId || null,
    payment: purchase.batchId ? null : { qr: purchase.paymentQr || null, uri: purchase.paymentUri || null },
    issuanceTxUrl: isTxHash(purchase.txHash) ? explorerTxUrl(purchase.txHash) : null,
    registeredOnChain: tokens.filter((product) => product.chain).length,
    // Same selection as anchorPendingProducts: unclaimed products still waiting for the contract.
    pendingOnChain: chainEnabled() ? tokens.filter((product) => product.secretCode && !product.chain && !product.claimed).length : 0,
    claimed: tokens.filter((product) => product.claimed).length
  };
};

// GET /api/purchases/:id checks the payment and returns the batch with its secret codes and QR images.
// With ?summary=1 it returns only purchaseSummary, for the list of batches.
const getPurchaseStatus = async (request, response, purchaseId) => {
  const purchase = purchases.get(purchaseId);
  if (!purchase) {
    sendJson(response, 404, { error: 'La compra no existe.' });
    return;
  }
  const summaryOnly = new URL(request.url, 'http://localhost').searchParams.has('summary');

  try {
    if (!purchase.batchId) {
      let intent;
      try {
        intent = await getClient().paymentIntents.fetch(purchase.intentId);
      } catch (error) {
        // The list still shows a pending purchase when Cosmos Pay cannot be reached; the next check retries.
        if (!summaryOnly) throw error;
        console.error('Cosmos status error (summary):', error.message);
        sendJson(response, 200, { status: 'unknown', succeeded: false, purchase: purchaseSummary(purchase) });
        return;
      }
      if (!intent.isSucceeded) {
        sendJson(response, 200, { status: intent.status, succeeded: false, txHash: intent.txHash || null, purchase: purchaseSummary(purchase) });
        return;
      }
      finalizePurchase(purchase, intent.txHash || null);
    }
    sendJson(response, 200, {
      status: 'succeeded',
      succeeded: true,
      paymentValidated: true,
      purchase: purchaseSummary(purchase),
      ...(summaryOnly ? {} : { batch: await batchResponse(batches.get(purchase.batchId), true) })
    });
  } catch (error) {
    sendError(response, error, 502, 'No se pudo consultar automáticamente el pago.', 'Cosmos automatic status error:');
  }
};

const getBatch = async (request, response, batchId) => {
  const batch = batches.get(normalizeId(batchId));
  if (!batch) {
    sendJson(response, 404, { error: 'El lote no existe.' });
    return;
  }
  sendJson(response, 200, await batchResponse(batch));
};

const createProduct = async (request, response) => {
  if (!isAdminRequest(request)) {
    sendJson(response, 401, { error: 'No autorizado. Los productos se emiten comprando un lote con Cosmos Pay.' });
    return;
  }

  try {
    const fields = readProductFields(await readJson(request));
    if (!fields) {
      sendJson(response, 400, { error: 'Indica modelo, lote y destino con valores válidos.' });
      return;
    }
    const product = mintProduct(fields);
    saveState();
    anchorPendingProducts();
    sendJson(response, 201, productResponse(product, true));
  } catch (error) {
    sendError(response, error, 500, 'No se pudo crear el producto.', 'Create product error:');
  }
};

const getProduct = (request, response, token) => {
  const product = products.get(normalizeId(token));
  if (!product) {
    sendJson(response, 404, { error: 'El token de producto no existe.' });
    return;
  }
  sendJson(response, 200, publicProductResponse(product));
};

const readClaimBody = async (request, response) => {
  try {
    return await readJson(request);
  } catch (error) {
    sendError(response, error, 400, 'No se pudo leer la solicitud.', 'Claim request error:');
    return null;
  }
};

const qrNotFound = 'Este QR no corresponde a ningún producto registrado. Revisá que sea el QR de la etiqueta interna del empaque.';

// Returns [status, message] when the product cannot be claimed by this owner.
const claimRejection = (product, owner) => {
  if (product.claimed) return [409, product.owner === owner ? 'Esta garantía ya está activada a tu nombre.' : 'Este producto ya fue reclamado.'];
  if (!isStellarAddress(owner)) return [400, 'Indica una dirección pública Stellar válida (G...).'];
  return null;
};

// Called synchronously after the request body was read, so two concurrent claims cannot both pass the check.
const completeClaim = (response, product, owner, claimTransaction = `demo-${randomUUID()}`) => {
  const rejection = claimRejection(product, owner);
  if (rejection) {
    sendJson(response, rejection[0], { error: rejection[1] });
    return;
  }

  Object.assign(product, { claimed: true, owner, claimedAt: new Date().toISOString(), claimTransaction });
  saveState();
  sendJson(response, 200, productResponse(product));
};

// ---- Claim on Stellar ----
// 1. prepare: the browser derives the activation key from the QR and gets the message to sign with it.
// 2. transaction: with that signature the server builds the activation; the buyer's wallet authorizes it.
// 3. POST /api/warranties with signedXdr: the admin account submits it and the claim is saved with its hash.
// The secret never reaches the server in this flow: the product is found by its activation public key.

// Checks shared by the three steps. Sends the error and returns null when the claim cannot go on.
const validateOnChainClaim = (response, body) => {
  if (!chainEnabled()) {
    sendJson(response, 409, { error: 'La activación en Stellar no está configurada en este servidor.' });
    return null;
  }
  const key = String(body.activationKey || '').toLowerCase();
  const product = /^[0-9a-f]{64}$/.test(key) && [...products.values()].find((candidate) => activationKeyOf(candidate) === key);
  if (!product) {
    sendJson(response, 404, { error: qrNotFound });
    return null;
  }
  const owner = String(body.owner || '').trim();
  const rejection = claimRejection(product, owner);
  if (rejection) {
    sendJson(response, rejection[0], { error: rejection[1] });
    return null;
  }
  if (!product.chain) {
    anchorPendingProducts();
    sendJson(response, 409, { error: 'Este producto todavía se está registrando en Stellar. Probá de nuevo en unos minutos.', retryable: true });
    return null;
  }
  return { product, owner, tokenId: product.chain.tokenId };
};

const prepareClaim = async (request, response) => {
  const body = await readClaimBody(request, response);
  if (!body) return;
  // Without a contract the browser falls back to the demo claim.
  if (!chainEnabled()) {
    sendJson(response, 200, { onChain: false });
    return;
  }
  const claim = validateOnChainClaim(response, body);
  if (!claim) return;
  try {
    const message = await activationMessage(claim.tokenId, claim.owner);
    // feeAccount: an existing account for the payment with which the Cavos kit creates a new buyer account.
    sendJson(response, 200, { onChain: true, message: message.toString('base64'), feeAccount: adminAddress() });
  } catch (error) {
    sendError(response, error, 502, 'No se pudo preparar la activación en Stellar.', 'Stellar prepare error:');
  }
};

const buildClaimTransaction = async (request, response) => {
  const body = await readClaimBody(request, response);
  if (!body) return;
  const claim = validateOnChainClaim(response, body);
  if (!claim) return;
  const signature = Buffer.from(String(body.signature || ''), 'base64');
  if (signature.length !== 64) {
    sendJson(response, 400, { error: 'La firma del QR no es válida.' });
    return;
  }
  try {
    sendJson(response, 200, { xdr: await buildActivation({ tokenId: claim.tokenId, claimant: claim.owner, signature }) });
  } catch (error) {
    sendError(response, error, 502, 'No se pudo preparar la transacción de activación.', 'Stellar build error:');
  }
};

// Keeps a second request for the same product from submitting a duplicate transaction.
const claimsInFlight = new Set();

const submitOnChainClaim = async (response, body) => {
  const claim = validateOnChainClaim(response, body);
  if (!claim) return;
  const { product, owner, tokenId } = claim;
  if (claimsInFlight.has(product.token)) {
    sendJson(response, 409, { error: 'La activación de este producto ya se está registrando en Stellar.', retryable: true });
    return;
  }
  claimsInFlight.add(product.token);
  try {
    const txHash = await submitActivation({ tokenId, claimant: owner, signedXdr: body.signedXdr });
    completeClaim(response, product, owner, txHash);
  } catch (error) {
    sendError(response, error, 502, 'No se pudo registrar la activación en Stellar.', 'Stellar claim error:');
  } finally {
    claimsInFlight.delete(product.token);
  }
};

// Claim from the buyer's panel. With signedXdr it is the last on-chain step; otherwise it is the demo claim, where
// the secret read from the QR identifies the product and the claim is stored only in this server.
const claimWarranty = async (request, response) => {
  const body = await readClaimBody(request, response);
  if (!body) return;
  if (body.signedXdr) {
    await submitOnChainClaim(response, body);
    return;
  }
  // Current QR links send the opaque key; labels printed before send the code itself.
  const secret = normalizeId(body.qr ? secretFromQrKey(body.qr) : body.secret);
  const product = secret && [...products.values()].find((candidate) => candidate.secretHash === hashSecret(secret));
  if (!product) {
    sendJson(response, 404, { error: qrNotFound });
    return;
  }
  // Products with a secret code are activated in the contract once it is configured, never only locally.
  // Already claimed ones fall through, so completeClaim answers "ya fue reclamado".
  if (chainEnabled() && product.secretCode && !product.claimed) {
    sendJson(response, 409, { error: 'Este producto se activa en Stellar. Recargá la página y volvé a escanear el QR.' });
    return;
  }
  completeClaim(response, product, String(body.owner || '').trim());
};

const listWarranties = (request, response) => {
  const owner = new URL(request.url, 'http://localhost').searchParams.get('owner') || '';
  if (!isStellarAddress(owner)) {
    sendJson(response, 400, { error: 'Indica una dirección pública Stellar válida (G...).' });
    return;
  }
  const warranties = [...products.values()]
    .filter((product) => product.claimed && product.owner === owner)
    .sort((a, b) => String(b.claimedAt || '').localeCompare(String(a.claimedAt || '')))
    .map((product) => productResponse(product));
  sendJson(response, 200, { owner, warranties });
};

const serveCavosConfig = (request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(`window.CAVOS_APP_ID = ${JSON.stringify(cavosAppId)};`);
};

// Labels printed before the panel scanner pointed to activate.html?token=...&secret=...
const redirectLegacyActivation = (request, response) => {
  const secret = new URL(request.url, 'http://localhost').searchParams.get('secret');
  response.writeHead(302, { Location: secret ? `app.html#q=${qrKeyFor(normalizeId(secret))}` : 'app.html' });
  response.end();
};

const serveFile = async (response, pathname) => {
  // Browsers ask for /favicon.ico on their own, even with a <link rel="icon">: both point at the same drawing.
  const requestPath = pathname === '/' ? '/index.html' : pathname === '/favicon.ico' ? '/favicon.svg' : pathname;
  try {
    const file = vendorFiles[requestPath] || (publicFiles.has(requestPath) && requestPath);
    if (!file) throw new Error('Not a public file');
    const content = await readFile(join(root, file));
    response.writeHead(200, { 'Content-Type': contentTypes[extname(requestPath)] });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
};

// Markets offered by the company form. The destination text is composed here, never in the browser.
const listCountries = (request, response) => {
  sendJson(response, 200, {
    countries: countries.map(({ code, name, region }) => ({ code, name, region, destination: destinationForCountry(code) }))
  });
};

const routes = [
  ['GET', /^\/api\/countries$/, listCountries],
  ['POST', /^\/api\/purchases$/, createBatchPayment],
  ['GET', /^\/api\/purchases\/([^/]+)$/, getPurchaseStatus],
  ['GET', /^\/api\/batches\/([^/]+)$/, getBatch],
  ['POST', /^\/api\/products$/, createProduct],
  ['GET', /^\/api\/products\/([^/]+)$/, getProduct],
  ['GET', /^\/activate\.html$/, redirectLegacyActivation],
  ['POST', /^\/api\/warranties\/prepare$/, prepareClaim],
  ['POST', /^\/api\/warranties\/transaction$/, buildClaimTransaction],
  ['POST', /^\/api\/warranties$/, claimWarranty],
  ['GET', /^\/api\/warranties$/, listWarranties],
  ['GET', /^\/cavos-config\.js$/, serveCavosConfig]
];

const handleRequest = async (request, response) => {
  let pathname;
  try {
    ({ pathname } = new URL(request.url, 'http://localhost'));
  } catch {
    response.writeHead(400);
    response.end('Bad request');
    return;
  }

  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    response.writeHead(204, {
      ...(corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin } : {}),
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    response.end();
    return;
  }

  for (const [method, pattern, handler] of routes) {
    const match = request.method === method && pathname.match(pattern);
    if (match) {
      await handler(request, response, match[1]);
      return;
    }
  }

  if (request.method === 'GET') {
    await serveFile(response, pathname);
    return;
  }
  response.writeHead(405);
  response.end('Method not allowed');
};

// An unexpected error in one request must never take the whole server down.
createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error('Unexpected request error:', error);
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
}).listen(port, () => {
  console.log(`Verifire running at http://localhost:${port}`);
  console.log(chainEnabled() ? `Garantías registradas en el contrato Stellar ${contractId}` : 'Sin STELLAR_CONTRACT_ID: las garantías se guardan solo en este servidor (modo demo).');
  // Retries products whose registration failed or was interrupted by a restart.
  anchorPendingProducts();
});
