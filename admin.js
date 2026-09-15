const form = document.getElementById('mint-form');
const result = document.getElementById('mint-result');
const batchResult = document.getElementById('batch-result');
// The last purchase is kept so a reload before the payment is confirmed does not lose its QR codes.
const LAST_PURCHASE_KEY = 'verifireLastPurchase';
let purchaseId = '';
let pollTimer = null;
let currentBatch = null;

const stopPolling = () => {
  window.clearTimeout(pollTimer);
  pollTimer = null;
};

const rememberPurchase = (purchase) => {
  try {
    if (purchase) localStorage.setItem(LAST_PURCHASE_KEY, JSON.stringify(purchase));
    else localStorage.removeItem(LAST_PURCHASE_KEY);
  } catch {
    // Without storage the purchase simply cannot be resumed after a reload.
  }
};

const productLabel = (token) => `
  <figure class="secret-label">
    <div class="label-codes">
      <div class="label-code">
        <img src="${escapeHtml(token.publicQr)}" alt="QR público del producto ${escapeHtml(token.token)}" width="120" height="120">
        <span>Exterior de la caja</span>
      </div>
      <div class="label-code">
        <img src="${escapeHtml(token.secretQr)}" alt="QR secreto del producto ${escapeHtml(token.token)}" width="120" height="120">
        <span>Interior · secreto</span>
      </div>
    </div>
    <figcaption><strong>${escapeHtml(token.token)}</strong></figcaption>
  </figure>`;

const showBatch = (batch) => {
  if (!batch || !Array.isArray(batch.tokens) || !batch.tokens[0]) {
    batchResult.className = 'verify-details is-claimed';
    batchResult.textContent = 'El pago aparece confirmado, pero todavía estamos preparando los tokens. Actualiza en unos segundos.';
    return false;
  }
  stopPolling();
  purchaseId = '';
  currentBatch = batch;
  batchResult.className = 'verify-details is-available';
  batchResult.innerHTML = `
    <strong>${escapeHtml(batch.quantity)} QR secretos generados · ${escapeHtml(batch.batchId)}</strong>
    <span>Cada producto tiene dos QR. El público va por fuera de la caja: cualquiera lo escanea sin iniciar sesión y solo ve los datos públicos del producto. El secreto va adentro del empaque: el cliente lo escanea desde su panel de Verifire (con sesión) para activar la garantía, y sirve una sola vez. El CSV es para el control interno de tu empresa.</span>
    <div class="batch-toolbar">
      <button class="button button-primary" type="button" data-batch-action="print">Imprimir etiquetas</button>
      <button class="button button-secondary" type="button" data-batch-action="csv">Descargar CSV</button>
    </div>
    <details class="batch-public">
      <summary>QR público del lote</summary>
      <img src="${escapeHtml(batch.publicQr)}" alt="QR público del lote ${escapeHtml(batch.batchId)}" width="200" height="200">
      <span>${escapeHtml(batch.publicUrl)}</span>
    </details>
    <div class="label-sheet">${batch.tokens.map(productLabel).join('')}</div>`;
  return true;
};

const downloadCsv = (batch) => {
  const rows = [
    ['token', 'codigo_secreto', 'enlace_qr_publico', 'enlace_qr_secreto'],
    ...batch.tokens.map((token) => [token.token, token.secretCode, token.publicUrl, token.secretUrl])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const link = document.createElement('a');
  // The BOM makes Excel open the accents correctly.
  link.href = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `${batch.batchId}-codigos-secretos.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

batchResult.addEventListener('click', (event) => {
  const action = event.target.closest('[data-batch-action]')?.dataset.batchAction;
  if (!currentBatch || !action) return;
  if (action === 'print') window.print();
  if (action === 'csv') downloadCsv(currentBatch);
});

const pollPurchase = async () => {
  const polledPurchaseId = purchaseId;
  const statusLine = result.querySelector('span:last-of-type');
  pollTimer = null;
  try {
    const response = await fetch(`/api/purchases/${encodeURIComponent(polledPurchaseId)}`);
    const status = await readResponse(response);
    // Ignore responses for a purchase that was already completed or replaced.
    if (polledPurchaseId !== purchaseId) return;
    if (response.status === 404) {
      rememberPurchase(null);
      statusLine.textContent = status.error || 'La compra no existe.';
      return;
    }
    if (!response.ok) throw new Error(status.error || 'No se pudo consultar el pago.');
    if (status.succeeded && showBatch(status.batch)) {
      statusLine.textContent = 'Pago confirmado. Tus QR secretos están listos más abajo.';
      return;
    }
    statusLine.textContent = status.succeeded
      ? 'Pago confirmado. Preparando los tokens...'
      : `Estado Cosmos Pay: ${status.status || 'pendiente'}. Comprobando automáticamente...`;
    pollTimer = window.setTimeout(pollPurchase, status.succeeded ? 2000 : 4000);
  } catch (error) {
    if (polledPurchaseId !== purchaseId) return;
    statusLine.textContent = error.message;
    pollTimer = window.setTimeout(pollPurchase, 6000);
  }
};

const followPurchase = (purchase) => {
  purchaseId = purchase.purchaseId;
  result.className = 'verify-details is-available';
  result.innerHTML = `<strong>Pago creado: ${escapeHtml(purchase.amount)} ${escapeHtml(purchase.asset)}</strong><span>Compra ${escapeHtml(purchase.purchaseId)} · ${escapeHtml(purchase.quantity)} tokens</span><span>Escanea el QR desde Cosmos Pay para pagar la emisión.</span>${purchase.qr ? `<img src="${escapeHtml(purchase.qr)}" alt="QR de pago Cosmos Pay" width="240" height="240">` : ''}<span>Esperando confirmación automática de Cosmos Pay...</span>`;
  pollPurchase();
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  stopPolling();
  purchaseId = '';
  try {
    const formData = new FormData(form);
    const response = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: formData.get('model'),
        lot: formData.get('lot'),
        destination: formData.get('destination'),
        quantity: Number(formData.get('quantity'))
      })
    });
    const purchase = await readResponse(response);
    if (!response.ok) throw new Error(purchase.error || 'No se pudo emitir el token.');
    const saved = { purchaseId: purchase.purchaseId, amount: purchase.amount, asset: purchase.asset, quantity: purchase.quantity, qr: purchase.qr };
    rememberPurchase(saved);
    currentBatch = null;
    batchResult.className = 'verify-details hidden';
    followPurchase(saved);
  } catch (error) {
    result.className = 'verify-details is-claimed';
    result.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

try {
  const saved = JSON.parse(localStorage.getItem(LAST_PURCHASE_KEY) || 'null');
  if (saved?.purchaseId) followPurchase(saved);
} catch {
  rememberPurchase(null);
}
