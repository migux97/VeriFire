// Every batch this company emitted: search, ordering, activation stats, labels to print or download.
// A purchase id is the key to its secret codes, so the list of purchases lives in this browser (see common.js) and
// the codes are fetched from the server only when a batch is opened, printed or downloaded.
const loggedIn = guardSession();

const batchList = document.getElementById('batch-list');
const batchesCount = document.getElementById('batches-count');
const batchesStatus = document.getElementById('batches-status');
const batchesEmpty = document.getElementById('batches-empty');
const batchesEmptyText = document.getElementById('batches-empty-text');
const searchInput = document.getElementById('batch-search');
const sortSelect = document.getElementById('batch-sort');
const statClaimedPercent = document.getElementById('stat-claimed-percent');
const statClaimedBar = document.getElementById('stat-claimed-bar');
const statClaimedDetail = document.getElementById('stat-claimed-detail');
const statTopModel = document.getElementById('stat-top-model');
const statTopDetail = document.getElementById('stat-top-detail');
const statBatches = document.getElementById('stat-batches');
const statBatchesDetail = document.getElementById('stat-batches-detail');

const POLL_MS = 5000;
// Every 12 checks (about a minute) every batch is refreshed, not only the ones waiting for something.
const REFRESH_EVERY_TICKS = 12;

// purchaseId -> summary from the server (no secrets), or { error }.
const summaries = new Map();
// purchaseId -> batch with secret codes and QR images, loaded when first needed.
const fullBatches = new Map();
let openPurchaseId = '';
let pollTimer = null;
let pollTicks = 0;

const showStatus = (message, type) => {
  batchesStatus.textContent = message;
  batchesStatus.className = message ? `claim-message is-${type}` : 'claim-message';
};

const loadFullBatch = async (purchaseId) => {
  if (fullBatches.has(purchaseId)) return fullBatches.get(purchaseId);
  const data = await fetchPurchase(purchaseId);
  if (!data.batch) throw new Error('Este lote todavía no está listo: falta confirmar el pago.');
  fullBatches.set(purchaseId, data.batch);
  summaries.set(purchaseId, data.purchase);
  return data.batch;
};

// ---- Downloads ----

const downloadBlob = (blob, filename) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};

const downloadDataUrl = async (dataUrl, filename) => downloadBlob(await (await fetch(dataUrl)).blob(), filename);

const downloadCsv = (batch) => {
  const rows = [
    ['lote', 'modelo', 'lote_fabricacion', 'destino', 'token', 'codigo_secreto', 'enlace_qr_publico', 'enlace_qr_secreto'],
    ...batch.tokens.map((token) => [batch.batchId, batch.model, batch.lot, batch.destination, token.token, token.secretCode, token.publicUrl, token.secretUrl])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  // The BOM makes Excel open the accents correctly.
  downloadBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), `${batch.batchId}-codigos-secretos.csv`);
};

// ---- Search, ordering and stats ----

const dateFormat = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
const createdAt = (summary) => (summary?.createdAt ? new Date(summary.createdAt).getTime() : 0);
const claimedRatio = (summary) => (summary?.quantity ? (summary.claimed || 0) / summary.quantity : 0);

// Searches the labels of a batch: what the company knows it by.
const matchesSearch = (summary, query) => {
  if (!query) return true;
  if (!summary || summary.error) return false;
  return [summary.batchId, summary.model, summary.lot, summary.destination]
    .filter(Boolean)
    .some((label) => String(label).toLowerCase().includes(query));
};

const sorters = {
  recent: (first, second) => createdAt(second) - createdAt(first),
  oldest: (first, second) => createdAt(first) - createdAt(second),
  'claimed-desc': (first, second) => claimedRatio(second) - claimedRatio(first) || (second?.claimed || 0) - (first?.claimed || 0),
  'claimed-asc': (first, second) => claimedRatio(first) - claimedRatio(second) || (first?.claimed || 0) - (second?.claimed || 0),
  'quantity-desc': (first, second) => (second?.quantity || 0) - (first?.quantity || 0),
  'quantity-asc': (first, second) => (first?.quantity || 0) - (second?.quantity || 0)
};

const visiblePurchaseIds = () => {
  const query = searchInput.value.trim().toLowerCase();
  const sort = sorters[sortSelect.value] || sorters.recent;
  return savedPurchaseIds()
    .filter((purchaseId) => matchesSearch(summaries.get(purchaseId), query))
    .sort((first, second) => sort(summaries.get(first), summaries.get(second)));
};

const renderStats = () => {
  const batches = savedPurchaseIds().map((purchaseId) => summaries.get(purchaseId)).filter((summary) => summary && !summary.error && summary.batchId);
  const tokens = batches.reduce((total, summary) => total + (Number(summary.quantity) || 0), 0);
  const claimed = batches.reduce((total, summary) => total + (Number(summary.claimed) || 0), 0);
  const percent = tokens ? Math.round((claimed / tokens) * 100) : 0;

  statClaimedPercent.textContent = tokens ? `${percent}%` : '—';
  statClaimedBar.style.width = `${percent}%`;
  statClaimedDetail.textContent = tokens
    ? `${claimed} de ${tokens} ${tokens === 1 ? 'token activado' : 'tokens activados'}`
    : 'Sin lotes todavía';

  statBatches.textContent = batches.length ? String(batches.length) : '—';
  statBatchesDetail.textContent = batches.length
    ? `${tokens} ${tokens === 1 ? 'token emitido' : 'tokens emitidos'}`
    : 'Sin lotes todavía';

  // The most claimed product adds up every batch of the same model.
  const byModel = new Map();
  batches.forEach((summary) => {
    const entry = byModel.get(summary.model) || { claimed: 0, quantity: 0 };
    entry.claimed += Number(summary.claimed) || 0;
    entry.quantity += Number(summary.quantity) || 0;
    byModel.set(summary.model, entry);
  });
  const [topModel, top] = [...byModel.entries()].sort((first, second) => second[1].claimed - first[1].claimed)[0] || [];
  if (!top || !top.claimed) {
    statTopModel.textContent = '—';
    statTopDetail.textContent = 'Sin activaciones todavía';
    return;
  }
  statTopModel.textContent = topModel;
  statTopDetail.textContent = `${top.claimed} de ${top.quantity} activados (${Math.round((top.claimed / top.quantity) * 100)}%)`;
};

// ---- Rendering ----

const batchState = (summary) => {
  if (!summary.batchId) return { label: 'Esperando pago', tone: 'pending', icon: 'fa-clock' };
  if (summary.pendingOnChain > 0) return { label: 'Registrando en Stellar', tone: 'pending', icon: 'fa-arrows-rotate' };
  if (summary.registeredOnChain > 0 && summary.registeredOnChain === summary.quantity) return { label: 'Listo · en Stellar', tone: 'ready', icon: 'fa-circle-check' };
  return { label: 'Listo', tone: 'ready', icon: 'fa-circle-check' };
};

// Connects the factory's work with the customers who scan the box: how many products of the batch are activated.
const activationProgress = (summary) => {
  if (!summary.batchId) return '';
  const total = Number(summary.quantity) || 0;
  const percent = total ? Math.round((summary.claimed / total) * 100) : 0;
  return `
    <div class="batch-progress">
      <div class="batch-progress-head">
        <span>${summary.claimed} / ${total} ${total === 1 ? 'activado' : 'activados'} por clientes</span>
        <span class="batch-progress-percent">${percent}%</span>
      </div>
      <div class="batch-progress-track" role="img" aria-label="${summary.claimed} de ${total} productos con la garantía activada">
        <span class="batch-progress-bar" style="width: ${percent}%"></span>
      </div>
    </div>`;
};

const actionButton = (action, label, icon, variant = 'secondary', extra = '') => `
  <button class="button button-${variant}" type="button" data-action="${action}" ${extra}>${icon ? `<i class="fa-solid ${icon}" aria-hidden="true"></i> ` : ''}${label}</button>`;

const summaryHtml = (purchaseId) => {
  const summary = summaries.get(purchaseId);
  if (!summary) return '<p class="batch-item-note">Cargando lote...</p>';
  if (summary.error) {
    return `
      <div class="batch-item-head">
        <div class="batch-item-title">
          <span class="batch-id">${escapeHtml(purchaseId)}</span>
          <h3>Compra no disponible</h3>
          <p class="batch-meta">${escapeHtml(summary.error)}</p>
        </div>
      </div>
      <div class="batch-toolbar">${actionButton('retry', 'Reintentar', 'fa-rotate-right')}${actionButton('forget', 'Quitar de la lista', 'fa-xmark')}</div>`;
  }

  const state = batchState(summary);
  const open = openPurchaseId === purchaseId;
  const meta = [
    `Lote ${summary.lot}`,
    `Destino ${summary.destination}`,
    `${summary.quantity} ${summary.quantity === 1 ? 'token' : 'tokens'}`,
    `${summary.amount} ${summary.asset}`,
    summary.createdAt ? dateFormat.format(new Date(summary.createdAt)) : ''
  ].filter(Boolean).map(escapeHtml).join(' · ');
  const actions = summary.batchId
    ? [
      actionButton('toggle', open ? 'Ocultar etiquetas' : 'Ver etiquetas', open ? 'fa-eye-slash' : 'fa-eye', 'primary', `aria-expanded="${open}"`),
      actionButton('print', 'Imprimir', 'fa-print'),
      actionButton('csv', 'Descargar CSV', 'fa-file-csv'),
      actionButton('lot-qr', 'QR del lote', 'fa-qrcode')
    ].join('')
    : actionButton('toggle', open ? 'Ocultar QR de pago' : 'Ver QR de pago', 'fa-qrcode', 'primary', `aria-expanded="${open}"`) + actionButton('forget', 'Quitar de la lista', 'fa-xmark');
  const ledger = summary.issuanceTxUrl
    ? `<a class="ledger-link" href="${escapeHtml(summary.issuanceTxUrl)}" target="_blank" rel="noopener noreferrer">Ver pago de emisión en Stellar <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i><span class="visually-hidden"> (se abre en una pestaña nueva)</span></a>`
    : '';

  return `
    <div class="batch-item-head">
      <div class="batch-item-title">
        <span class="batch-id">${escapeHtml(summary.batchId || 'Pago pendiente')}</span>
        <h3>${escapeHtml(summary.model)}</h3>
        <p class="batch-meta">${meta}</p>
      </div>
      <span class="batch-badge is-${state.tone}"><i class="fa-solid ${state.icon}" aria-hidden="true"></i> ${escapeHtml(state.label)}</span>
    </div>
    ${activationProgress(summary)}
    <div class="batch-toolbar">${actions}</div>
    ${ledger}`;
};

const qrCode = (token, kind) => {
  const secret = kind === 'secret';
  return `
    <div class="label-code">
      <img src="${escapeHtml(secret ? token.secretQr : token.publicQr)}" alt="QR ${secret ? 'secreto' : 'público'} del producto ${escapeHtml(token.token)}" width="120" height="120">
      <span>${secret ? 'Interior · secreto' : 'Exterior de la caja'}</span>
      <button class="label-download" type="button" data-action="download-qr" data-token="${escapeHtml(token.token)}" data-kind="${kind}">Descargar</button>
    </div>`;
};

const productLabel = (token) => `
  <figure class="secret-label">
    <div class="label-codes">${qrCode(token, 'public')}${qrCode(token, 'secret')}</div>
    <figcaption><strong>${escapeHtml(token.token)}</strong></figcaption>
  </figure>`;

const detailHtml = (batch) => `
  <p>Cada producto tiene dos QR:</p>
  <ul class="batch-guide">
    <li><strong>QR público, por fuera de la caja.</strong> Cualquiera lo escanea sin iniciar sesión y solo ve los datos públicos del producto.</li>
    <li><strong>QR secreto, adentro del empaque.</strong> El cliente lo escanea desde su panel de Verifire para activar la garantía. Sirve una sola vez.</li>
  </ul>
  <p class="batch-item-note">El CSV incluye los códigos secretos: guardalo solo para el control interno de tu empresa.</p>
  <div class="label-sheet">${batch.tokens.map(productLabel).join('')}</div>`;

const paymentDetailHtml = (summary) => `
  <p><strong>Pagá ${escapeHtml(summary.amount)} ${escapeHtml(summary.asset)}</strong> para emitir ${escapeHtml(summary.quantity)} ${summary.quantity === 1 ? 'token' : 'tokens'} de ${escapeHtml(summary.model)}.</p>
  <p class="batch-item-note">Escaneá el QR con Cosmos Pay. El lote se genera solo cuando se confirma el pago, y esta tarjeta se actualiza sola.</p>
  <p class="payment-warning"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Pagá una sola vez: este QR es una transferencia real y se puede volver a pagar, pero un segundo pago no genera otro lote.</p>
  ${summary.payment?.qr ? `<img class="payment-qr" src="${escapeHtml(summary.payment.qr)}" alt="QR de pago Cosmos Pay" width="240" height="240">` : '<p class="batch-item-note is-error">Esta compra no tiene un QR de pago guardado.</p>'}`;

const itemFor = (purchaseId) => Array.from(batchList.children).find((item) => item.dataset.purchase === purchaseId);

const renderSummary = (purchaseId) => {
  const item = itemFor(purchaseId);
  if (!item) return;
  item.classList.toggle('is-open', openPurchaseId === purchaseId);
  item.querySelector('.batch-item-summary').innerHTML = summaryHtml(purchaseId);
};

// Keeps one element per purchase, so refreshing a summary never redraws an open label sheet.
const renderList = () => {
  const ids = visiblePurchaseIds();
  const total = savedPurchaseIds().length;
  Array.from(batchList.children).forEach((item) => {
    if (!ids.includes(item.dataset.purchase)) item.remove();
  });
  ids.forEach((purchaseId, index) => {
    let item = itemFor(purchaseId);
    if (!item) {
      item = document.createElement('article');
      item.className = 'batch-item';
      item.dataset.purchase = purchaseId;
      item.innerHTML = '<div class="batch-item-summary"></div><div class="batch-detail" hidden></div>';
    }
    if (batchList.children[index] !== item) batchList.insertBefore(item, batchList.children[index] || null);
    renderSummary(purchaseId);
  });

  batchesCount.textContent = total ? `${ids.length} de ${total} ${total === 1 ? 'lote' : 'lotes'}` : '';
  batchesEmpty.hidden = ids.length > 0;
  batchesEmptyText.textContent = total
    ? 'Ningún lote coincide con la búsqueda. Probá con otro modelo, lote o destino.'
    : 'Todavía no emitiste lotes. Comprá tokens para generar tus primeras etiquetas.';
  renderStats();
};

// ---- Label sheet ----

const closeDetail = (purchaseId) => {
  const detail = itemFor(purchaseId)?.querySelector('.batch-detail');
  if (detail) {
    detail.hidden = true;
    detail.innerHTML = '';
  }
  if (openPurchaseId === purchaseId) openPurchaseId = '';
  renderSummary(purchaseId);
};

// Only one batch is open at a time, so printing prints only its labels.
const openDetail = async (purchaseId) => {
  if (openPurchaseId && openPurchaseId !== purchaseId) closeDetail(openPurchaseId);
  openPurchaseId = purchaseId;
  renderSummary(purchaseId);
  const detail = itemFor(purchaseId).querySelector('.batch-detail');
  detail.hidden = false;

  const summary = summaries.get(purchaseId);
  if (summary && !summary.batchId) {
    detail.innerHTML = paymentDetailHtml(summary);
    return null;
  }

  detail.innerHTML = '<p class="batch-item-note">Cargando etiquetas...</p>';
  try {
    const batch = await loadFullBatch(purchaseId);
    if (openPurchaseId !== purchaseId) return null;
    detail.innerHTML = detailHtml(batch);
    renderSummary(purchaseId);
    return batch;
  } catch (error) {
    detail.innerHTML = `<p class="batch-item-note is-error">${escapeHtml(error.message)}</p>`;
    return null;
  }
};

const printBatch = async (purchaseId) => {
  const ready = openPurchaseId === purchaseId && itemFor(purchaseId).querySelector('.label-sheet');
  if (!ready && !(await openDetail(purchaseId))) return;
  const images = Array.from(itemFor(purchaseId).querySelectorAll('.label-sheet img'));
  await Promise.all(images.map((image) => image.decode().catch(() => {})));
  window.print();
};

// ---- Updates ----

const needsPolling = (summary) => Boolean(summary) && !summary.error && (!summary.batchId || summary.pendingOnChain > 0);

const refreshSummary = async (purchaseId) => {
  const previous = summaries.get(purchaseId);
  try {
    const { purchase } = await fetchPurchase(purchaseId, { summary: true });
    summaries.set(purchaseId, purchase);
    // A purchase that just became a batch changes where it belongs in the list.
    if (previous && !previous.error && !previous.batchId && purchase.batchId) renderList();
    else renderSummary(purchaseId);
  } catch (error) {
    // A network hiccup keeps what was already shown; a purchase the server no longer has is marked.
    if (error.status === 404) summaries.set(purchaseId, { error: 'Esta compra ya no existe en el servidor.' });
    else if (!previous || previous.error) summaries.set(purchaseId, { error: error.message });
    renderSummary(purchaseId);
  }
  renderStats();
};

// Purchases waiting for their payment or for Stellar are checked every POLL_MS; every batch once a minute, so the
// activation counters follow what customers scan.
const schedulePolling = () => {
  window.clearTimeout(pollTimer);
  const ids = savedPurchaseIds();
  if (!ids.length) return;
  const pending = ids.filter((purchaseId) => needsPolling(summaries.get(purchaseId)));
  pollTimer = window.setTimeout(async () => {
    pollTicks += 1;
    await Promise.all((pollTicks % REFRESH_EVERY_TICKS === 0 ? ids : pending).map(refreshSummary));
    schedulePolling();
  }, POLL_MS);
};

// ---- Events ----

const handleListClick = async (event) => {
  const button = event.target.closest('[data-action]');
  const purchaseId = button?.closest('.batch-item')?.dataset.purchase;
  if (!purchaseId) return;
  const { action } = button.dataset;
  showStatus('', 'info');

  if (action === 'toggle') {
    if (openPurchaseId === purchaseId) closeDetail(purchaseId);
    else openDetail(purchaseId);
    return;
  }
  if (action === 'forget') {
    const confirmed = window.confirm('¿Quitar esta compra de tu lista? Si ya la pagaste, el lote se genera igual, pero no lo vas a ver en este panel.');
    if (!confirmed) return;
    forgetPurchase(purchaseId);
    summaries.delete(purchaseId);
    fullBatches.delete(purchaseId);
    if (openPurchaseId === purchaseId) openPurchaseId = '';
    renderList();
    return;
  }
  if (action === 'retry') {
    summaries.delete(purchaseId);
    renderSummary(purchaseId);
    await refreshSummary(purchaseId);
    schedulePolling();
    return;
  }

  // The remaining actions need the batch's codes, which may have to be downloaded first.
  button.disabled = true;
  try {
    if (action === 'print') {
      await printBatch(purchaseId);
      return;
    }
    const batch = await loadFullBatch(purchaseId);
    if (action === 'csv') downloadCsv(batch);
    if (action === 'lot-qr') await downloadDataUrl(batch.publicQr, `${batch.batchId}-qr-publico-del-lote.svg`);
    if (action === 'download-qr') {
      const token = batch.tokens.find((candidate) => candidate.token === button.dataset.token);
      const secret = button.dataset.kind === 'secret';
      if (token) await downloadDataUrl(secret ? token.secretQr : token.publicQr, `${token.token}-qr-${secret ? 'secreto' : 'publico'}.svg`);
    }
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    button.disabled = false;
  }
};

if (loggedIn) {
  migrateLegacyPurchase();
  const ids = savedPurchaseIds();
  renderList();

  batchList.addEventListener('click', handleListClick);
  searchInput.addEventListener('input', renderList);
  sortSelect.addEventListener('change', renderList);

  Promise.all(ids.map(refreshSummary)).then(() => {
    renderList();
    schedulePolling();
  });
}
