// Company purchase: pay a batch of tokens with Cosmos Pay. Once the payment is confirmed the batch, its labels and
// its activation counters live in lotes.html; this page only creates the purchase and follows its payment.
const loggedIn = guardSession();

const form = document.getElementById('mint-form');
const purchaseMessage = document.getElementById('purchase-message');
const paymentPanel = document.getElementById('payment-panel');
const goToBatches = document.getElementById('go-to-batches');
const countrySelect = document.getElementById('product-country');
const destinationPreview = document.getElementById('destination-preview');

const POLL_MS = 4000;
// Country code -> destination printed on the labels ("Argentina · LATAM"), as the server composes it.
const destinations = new Map();
let purchaseId = '';
let pollTimer = null;

const showMessage = (message, type) => {
  purchaseMessage.textContent = message;
  purchaseMessage.className = message ? `claim-message is-${type}` : 'claim-message';
};

// ---- Countries ----

const loadCountries = async () => {
  try {
    const response = await fetch('/api/countries');
    const data = await readResponse(response);
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar la lista de países.');

    const regions = new Map();
    data.countries.forEach((country) => {
      destinations.set(country.code, country.destination);
      if (!regions.has(country.region)) regions.set(country.region, []);
      regions.get(country.region).push(country);
    });
    // LATAM first, the rest in alphabetical order.
    const groups = [...regions.keys()].sort((first, second) => (first === 'LATAM' ? -1 : second === 'LATAM' ? 1 : first.localeCompare(second, 'es')));
    countrySelect.innerHTML = `<option value="">Elegí el país de destino</option>${groups.map((region) => `
      <optgroup label="${escapeHtml(region)}">${regions.get(region).map((country) => `<option value="${escapeHtml(country.code)}">${escapeHtml(country.name)}</option>`).join('')}</optgroup>`).join('')}`;
  } catch (error) {
    countrySelect.innerHTML = '<option value="">No se pudo cargar la lista de países</option>';
    showMessage(error.message, 'error');
  }
};

const showDestinationPreview = () => {
  const destination = destinations.get(countrySelect.value);
  destinationPreview.textContent = destination
    ? `En las etiquetas va a figurar: ${destination}`
    : 'La región se completa sola según el país que elijas.';
};

// ---- Payment ----

const showPayment = (purchase) => {
  paymentPanel.hidden = false;
  paymentPanel.innerHTML = `
    <strong>Pagá ${escapeHtml(purchase.amount)} ${escapeHtml(purchase.asset || 'XLM')} para emitir ${escapeHtml(purchase.quantity)} ${purchase.quantity === 1 ? 'token' : 'tokens'}</strong>
    <span>Escaneá el QR con Cosmos Pay. El lote se genera solo cuando se confirma el pago.</span>
    <span class="payment-warning"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Pagá una sola vez: este QR es una transferencia real y se puede volver a pagar, pero un segundo pago no genera otro lote.</span>
    ${purchase.qr ? `<img src="${escapeHtml(purchase.qr)}" alt="QR de pago Cosmos Pay" width="240" height="240">` : ''}
    <span id="payment-status">Esperando confirmación de Cosmos Pay...</span>`;
};

const pollPurchase = async () => {
  const polled = purchaseId;
  pollTimer = null;
  const statusLine = document.getElementById('payment-status');
  try {
    const data = await fetchPurchase(polled, { summary: true });
    // Ignore an answer for a purchase that was already replaced by a newer one.
    if (polled !== purchaseId) return;
    if (data.succeeded && data.purchase.batchId) {
      purchaseId = '';
      paymentPanel.hidden = true;
      goToBatches.hidden = false;
      showMessage(`Pago confirmado. El lote ${data.purchase.batchId} ya está en Mis lotes con sus etiquetas.`, 'success');
      return;
    }
    if (statusLine) {
      statusLine.textContent = data.succeeded
        ? 'Pago confirmado. Preparando los tokens...'
        : `Estado Cosmos Pay: ${data.status || 'pendiente'}. Comprobando automáticamente...`;
    }
  } catch (error) {
    if (polled !== purchaseId) return;
    if (statusLine) statusLine.textContent = error.message;
  }
  pollTimer = window.setTimeout(pollPurchase, POLL_MS);
};

const handleSubmit = async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  window.clearTimeout(pollTimer);
  purchaseId = '';
  goToBatches.hidden = true;
  showMessage('Creando el pago en Cosmos Pay...', 'info');
  try {
    const formData = new FormData(form);
    const response = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: String(formData.get('model') || '').trim(),
        lot: String(formData.get('lot') || '').trim(),
        country: String(formData.get('country') || ''),
        quantity: Number(formData.get('quantity'))
      })
    });
    const purchase = await readResponse(response);
    if (!response.ok) throw new Error(purchase.error || 'No se pudo crear el pago del lote.');

    // Saved right away: the purchase is already in Mis lotes, even if this page is closed before paying.
    savePurchase(purchase.purchaseId);
    purchaseId = purchase.purchaseId;
    form.reset();
    showMessage('', 'info');
    showPayment(purchase);
    pollPurchase();
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    button.disabled = false;
  }
};

if (loggedIn) {
  migrateLegacyPurchase();
  form.addEventListener('submit', handleSubmit);
  form.addEventListener('reset', () => window.setTimeout(showDestinationPreview));
  countrySelect.addEventListener('change', showDestinationPreview);
  loadCountries();
}
