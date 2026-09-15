// Public page behind the QR of a whole lot: read-only summary, no session needed.
const title = document.getElementById('batch-title');
const message = document.getElementById('batch-message');
const details = document.getElementById('batch-details');
const batchId = new URLSearchParams(window.location.search).get('batch');
const row = (label, value) => `<span><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</span>`;

const loadBatch = async () => {
  if (!batchId) {
    title.textContent = 'Lote no disponible';
    message.textContent = 'Escaneá el QR público del lote para ver sus productos.';
    return;
  }
  try {
    const response = await fetch(`/api/batches/${encodeURIComponent(batchId)}`);
    const batch = await readResponse(response);
    if (!response.ok) throw new Error(batch.error || 'No se pudo consultar el lote.');
    const claimed = batch.tokens.filter((token) => token.status === 'CLAIMED_IN_WARRANTY').length;
    title.textContent = 'Productos originales certificados';
    message.textContent = `${claimed} de ${batch.quantity} productos con la garantía activada. Este QR no revela códigos secretos.`;
    details.className = 'verify-details is-available';
    details.innerHTML = [
      row('Modelo', batch.model),
      row('Lote', batch.lot),
      row('Destino', batch.destination),
      row('Productos', batch.quantity),
      ...batch.tokens.map((token) => row(token.token, token.status === 'SEALED' ? 'Sellado' : 'Garantía activa'))
    ].join('');
  } catch (error) {
    title.textContent = 'Lote no disponible';
    message.textContent = error.message;
  }
};

loadBatch();
