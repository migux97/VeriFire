// Public page behind the QR on the outside of the box: anyone (for example store staff) can check a
// product here without logging in. It only shows public data and does not link to the rest of the app.
const message = document.getElementById('verify-message');
const title = document.getElementById('verify-title');
const details = document.getElementById('verify-details');
const verificationForm = document.getElementById('verification-form');
const verificationCode = document.getElementById('verification-code');
const statusLabels = { SEALED: 'Sellado en fábrica', CLAIMED_IN_WARRANTY: 'Garantía activa' };
const formatDate = (iso) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });

const renderProduct = (product) => {
  title.textContent = product.claimed ? 'Producto original · garantía activa' : 'Producto original · sellado';
  message.textContent = product.claimed
    ? 'La garantía de este producto ya fue activada por su comprador.'
    : 'La caja está sellada en fábrica y la garantía todavía no fue activada.';
  const rows = [
    ['Producto', product.token],
    ['Modelo', product.model],
    ['Lote', product.lot],
    ['Destino', product.destination],
    ['Estado', statusLabels[product.status] || product.status],
    ...(product.claimed ? [['Garantía activada el', formatDate(product.claimedAt)], ['Cobertura hasta', formatDate(product.warrantyUntil)]] : [])
  ];
  details.className = `verify-details ${product.claimed ? 'is-active' : 'is-available'}`;
  details.innerHTML = rows.map(([label, value]) => `<span><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</span>`).join('');
};

const loadProduct = async (requestedToken) => {
  const token = String(requestedToken || '').trim().toUpperCase();
  details.className = 'verify-details hidden';
  if (!token) {
    title.textContent = 'Verificá tu producto';
    message.textContent = 'Escaneá el QR de la caja o ingresá el código público del producto.';
    return;
  }

  title.textContent = 'Verificando producto...';
  message.textContent = 'Consultando autenticidad, lote y estado del producto.';
  try {
    const response = await fetch(`/api/products/${encodeURIComponent(token)}`);
    const product = await readResponse(response);
    if (!response.ok) throw new Error(product.error || 'No se pudo verificar el producto.');
    renderProduct(product);
  } catch (error) {
    title.textContent = 'No se pudo verificar';
    message.textContent = error.message;
  }
};

verificationForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loadProduct(verificationCode.value);
});

const tokenFromQr = new URLSearchParams(window.location.search).get('token') || '';
verificationCode.value = tokenFromQr;
loadProduct(tokenFromQr);
