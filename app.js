// Secret QR links carry an opaque key (app.html#q=...). Labels printed before used ?codigo= or ?secret=.
const claimFromLink = (search, hash) => {
  const qr = new URLSearchParams(String(hash || '').replace(/^#/, '')).get('q');
  if (qr) return { qr };
  const params = new URLSearchParams(search);
  const secret = params.get('codigo') || params.get('secret');
  return secret ? { secret } : null;
};

// Opening a QR link: keep it across the login redirect and remove it from the address bar.
const PENDING_QR_KEY = 'verifirePendingQr';
const linkClaim = claimFromLink(window.location.search, window.location.hash);
if (linkClaim) {
  sessionStorage.setItem(PENDING_QR_KEY, JSON.stringify(linkClaim));
  window.history.replaceState({}, document.title, window.location.pathname);
}

const loggedIn = guardSession();

const profileButton = document.getElementById('profile-button');
const profilePopover = document.getElementById('profile-popover');
const claimForm = document.getElementById('claim-form');
const claimMessage = document.getElementById('claim-message');
const scanStart = document.getElementById('scan-start');
const scanStop = document.getElementById('scan-stop');
const scanFile = document.getElementById('scan-file');
const scanViewer = document.getElementById('scan-viewer');
const scanVideo = document.getElementById('scan-video');
const vaultStatus = document.getElementById('vault-status');
const vaultCount = document.getElementById('vault-count');
const vaultGrid = document.getElementById('vault-grid');
const vaultEmpty = document.getElementById('vault-empty');
let walletAddress = '';
// What the scanned QR carries; it is sent to the server on activation and never shown.
let scannedClaim = null;

const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const monthName = (date) => months[date.getMonth()].replace(/^./, (letter) => letter.toUpperCase());
const formatDay = (iso) => {
  const date = new Date(iso);
  return `${date.getDate()} de ${monthName(date)}, ${date.getFullYear()}`;
};
const formatMonth = (iso) => {
  const date = new Date(iso);
  return `${monthName(date)} ${date.getFullYear()}`;
};

const showMessage = (message, type) => {
  claimMessage.textContent = message;
  claimMessage.className = `claim-message is-${type}`;
};

const renderProfile = () => {
  const user = storedUser();
  document.getElementById('profile-name').textContent = user?.name || 'Usuario Verifire';
  document.getElementById('profile-email').textContent = user?.email || 'Correo no disponible';
  document.getElementById('profile-avatar').textContent = (user?.name || 'V').charAt(0).toUpperCase();
};

const setProfileOpen = (open) => {
  profilePopover.hidden = !open;
  profileButton.setAttribute('aria-expanded', String(open));
};

// ---- Warranties ----

const warrantyCard = (product) => {
  const active = new Date(product.warrantyUntil).getTime() > Date.now();
  return `
    <article class="warranty-card">
      <div class="warranty-thumb" aria-hidden="true"><i class="fa-solid fa-box-open"></i></div>
      <div class="warranty-body">
        <div class="warranty-top">
          <span class="warranty-badge${active ? '' : ' is-expired'}"><i class="fa-solid ${active ? 'fa-shield-halved' : 'fa-clock-rotate-left'}" aria-hidden="true"></i> ${active ? 'VÁLIDO / PROTEGIDO' : 'COBERTURA VENCIDA'}</span>
          <h3>${escapeHtml(product.model)}</h3>
        </div>
        <dl class="warranty-meta">
          <div><dt>Fecha de reclamo</dt><dd>${formatDay(product.claimedAt)}</dd></div>
          <div><dt>Vigencia de la cobertura</dt><dd>Garantía oficial hasta ${formatMonth(product.warrantyUntil)}</dd></div>
        </dl>
      </div>
    </article>`;
};

const renderWarranties = (warranties) => {
  vaultGrid.innerHTML = warranties.map(warrantyCard).join('');
  vaultEmpty.hidden = warranties.length > 0;
  vaultCount.textContent = warranties.length ? `${warranties.length} ${warranties.length === 1 ? 'producto' : 'productos'}` : '';
};

const loadWarranties = async () => {
  vaultStatus.hidden = false;
  vaultStatus.textContent = 'Cargando tus garantías...';
  try {
    walletAddress = await resolveWalletAddress();
    const response = await fetch(`/api/warranties?owner=${encodeURIComponent(walletAddress)}`);
    const data = await readResponse(response);
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar tus garantías.');
    renderWarranties(data.warranties);
    vaultStatus.hidden = true;
  } catch (error) {
    vaultStatus.textContent = error.message;
  }
};

const setScannedClaim = (claim) => {
  scannedClaim = claim;
  claimForm.hidden = !claim;
};

const handleClaim = async (event) => {
  event.preventDefault();
  if (!scannedClaim) {
    showMessage('Primero escaneá el QR de la etiqueta interna del producto.', 'error');
    return;
  }

  const button = claimForm.querySelector('button');
  button.disabled = true;
  showMessage('Verificando el QR y registrando tu garantía...', 'info');
  try {
    const owner = walletAddress || await resolveWalletAddress();
    const response = await fetch('/api/warranties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...scannedClaim, owner })
    });
    const product = await readResponse(response);
    if (!response.ok) {
      // A QR that does not exist or was already used will not work on a retry.
      if (response.status < 500) setScannedClaim(null);
      throw new Error(product.error || 'No se pudo activar la garantía.');
    }
    setScannedClaim(null);
    showMessage(`¡Listo! La garantía de ${product.model} quedó activada a tu nombre.`, 'success');
    await loadWarranties();
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    button.disabled = false;
  }
};

// ---- QR scanning ----
// Uses the browser's native BarcodeDetector when available and falls back to jsQR (Safari, Firefox).

let barcodeDetector = null;
try {
  if (window.BarcodeDetector) barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
} catch {
  barcodeDetector = null;
}
let jsQrLoader = null;
let canvasContext = null;
let scanStream = null;
let scanTimer = null;
// Incremented on every stop, so a camera that finishes starting after the user moved on is closed right away.
let cameraRequest = 0;

const loadJsQr = () => {
  jsQrLoader ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'vendor/jsQR.js';
    script.onload = () => resolve(window.jsQR);
    script.onerror = () => {
      jsQrLoader = null;
      reject(new Error('No se pudo cargar el lector de QR. Revisá tu conexión e intentá de nuevo.'));
    };
    document.head.appendChild(script);
  });
  return jsQrLoader;
};

// Returns the text of the QR found in a video frame or image, or null.
const decodeQr = async (source, width, height) => {
  if (barcodeDetector) {
    try {
      const [code] = await barcodeDetector.detect(source);
      return code?.rawValue ?? null;
    } catch {
      barcodeDetector = null;
    }
  }
  const jsQR = await loadJsQr();
  const scale = Math.min(1, 800 / Math.max(width, height));
  const scaledWidth = Math.round(width * scale);
  const scaledHeight = Math.round(height * scale);
  canvasContext ||= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  canvasContext.canvas.width = scaledWidth;
  canvasContext.canvas.height = scaledHeight;
  canvasContext.drawImage(source, 0, 0, scaledWidth, scaledHeight);
  return jsQR(canvasContext.getImageData(0, 0, scaledWidth, scaledHeight).data, scaledWidth, scaledHeight)?.data ?? null;
};

const parseScannedQr = (text) => {
  try {
    const url = new URL(String(text || '').trim());
    return { claim: claimFromLink(url.search, url.hash), publicToken: url.searchParams.get('token') };
  } catch {
    return { claim: null };
  }
};

const useScannedText = (text) => {
  const { claim, publicToken } = parseScannedQr(text);
  setScannedClaim(claim);
  if (claim) {
    showMessage('QR del producto detectado. Tocá "Activar Garantía Oficial" para registrarlo a tu nombre.', 'success');
    claimForm.querySelector('button').focus();
    return;
  }
  showMessage(publicToken
    ? 'Ese es el QR público del producto: sirve para verificarlo. Para activar la garantía escaneá el QR de la etiqueta interna.'
    : 'No reconocimos ese QR como un QR de Verifire.', 'error');
};

const stopCamera = () => {
  cameraRequest += 1;
  window.clearTimeout(scanTimer);
  scanStream?.getTracks().forEach((track) => track.stop());
  scanStream = null;
  scanVideo.srcObject = null;
  scanViewer.hidden = true;
  scanStart.hidden = false;
  scanStart.disabled = false;
};

const scanVideoFrame = async () => {
  if (!scanStream) return;
  if (scanVideo.readyState >= 2) {
    try {
      const text = await decodeQr(scanVideo, scanVideo.videoWidth, scanVideo.videoHeight);
      if (text && scanStream) {
        stopCamera();
        useScannedText(text);
        return;
      }
    } catch (error) {
      stopCamera();
      showMessage(error.message, 'error');
      return;
    }
  }
  scanTimer = window.setTimeout(scanVideoFrame, 250);
};

const cameraErrors = {
  NotAllowedError: 'La cámara está bloqueada. Tocá el candado junto a la dirección, permití la cámara y volvé a intentar (en Windows revisá también Configuración > Privacidad > Cámara).',
  NotFoundError: 'No encontramos ninguna cámara en este dispositivo. Subí o pegá (Ctrl+V) una imagen del QR.',
  NotReadableError: 'La cámara está en uso por otra aplicación (Zoom, Teams, Meet...). Cerrala y volvé a intentar.'
};

const startCamera = async () => {
  if (scanStream || scanStart.disabled) return;
  if (!window.isSecureContext) {
    showMessage('La cámara solo funciona si Verifire se abre con https:// o desde localhost. Mientras tanto, subí o pegá (Ctrl+V) una imagen del QR.', 'error');
    return;
  }
  if (!window.navigator.mediaDevices?.getUserMedia) {
    showMessage('Este navegador no permite usar la cámara. Subí o pegá (Ctrl+V) una imagen del QR.', 'error');
    return;
  }
  const request = ++cameraRequest;
  scanStart.disabled = true;
  setScannedClaim(null);
  showMessage('Pidiendo permiso para usar la cámara...', 'info');
  let stream;
  try {
    stream = await window.navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (error) {
    if (request !== cameraRequest) return;
    scanStart.disabled = false;
    showMessage(cameraErrors[error?.name] || 'No pudimos abrir la cámara. Subí o pegá (Ctrl+V) una imagen del QR.', 'error');
    return;
  }
  if (request !== cameraRequest) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }
  scanStream = stream;
  scanVideo.srcObject = stream;
  try {
    await scanVideo.play();
  } catch {
    stopCamera();
    showMessage('No pudimos abrir la cámara. Subí o pegá (Ctrl+V) una imagen del QR.', 'error');
    return;
  }
  scanStart.disabled = false;
  scanViewer.hidden = false;
  scanStart.hidden = true;
  showMessage('Apuntá la cámara al QR de la etiqueta.', 'info');
  scanVideoFrame();
};

const readQrImage = async (image) => {
  stopCamera();
  setScannedClaim(null);
  showMessage('Leyendo la imagen...', 'info');
  try {
    const bitmap = await window.createImageBitmap(image);
    const text = await decodeQr(bitmap, bitmap.width, bitmap.height);
    if (text) useScannedText(text);
    else showMessage('No encontramos un QR en la imagen. Probá con una imagen más nítida y cercana.', 'error');
  } catch {
    showMessage('No pudimos leer esa imagen. Probá con otra imagen del QR.', 'error');
  }
};

const readQrPhoto = () => {
  const [file] = scanFile.files;
  scanFile.value = '';
  if (file) readQrImage(file);
};

// Ctrl+V anywhere in the panel with a screenshot or photo of the QR.
const handlePaste = (event) => {
  const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.kind === 'file' && item.type.startsWith('image/'));
  if (!imageItem) return;
  event.preventDefault();
  readQrImage(imageItem.getAsFile());
};

// ---- Page ----

const handleClick = (event) => {
  if (!profilePopover.hidden && !event.target.closest('.profile-menu')) setProfileOpen(false);

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'profile') setProfileOpen(profilePopover.hidden);
  if (action === 'logout') leaveSession('cerrada');
};

const handleKeydown = (event) => {
  if (event.key !== 'Escape' || profilePopover.hidden) return;
  setProfileOpen(false);
  profileButton.focus();
};

if (loggedIn) {
  renderProfile();
  document.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('paste', handlePaste);
  claimForm.addEventListener('submit', handleClaim);
  scanStart.addEventListener('click', startCamera);
  scanStop.addEventListener('click', stopCamera);
  scanFile.addEventListener('change', readQrPhoto);
  window.addEventListener('pagehide', stopCamera);
  loadWarranties();

  const pendingQr = sessionStorage.getItem(PENDING_QR_KEY);
  if (pendingQr) {
    sessionStorage.removeItem(PENDING_QR_KEY);
    try {
      setScannedClaim(JSON.parse(pendingQr));
      showMessage('QR del producto detectado. Tocá "Activar Garantía Oficial" para registrarlo a tu nombre.', 'success');
      claimForm.querySelector('button').focus();
    } catch {
      showMessage('No pudimos leer ese QR. Escanealo de nuevo.', 'error');
    }
  }
}
