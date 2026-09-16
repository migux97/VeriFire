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
const enableDevicesButton = document.getElementById('enable-devices-button');
const enableDevicesForm = document.getElementById('enable-devices-form');
const enableDevicesPassword = document.getElementById('enable-devices-password');
const enableDevicesCancel = document.getElementById('enable-devices-cancel');
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

// The buyer only ever sees the certification: the transaction that activated the warranty in the contract, signed
// by the issuing account. The payment that bought the batch belongs to the company's treasury and stays out of here.
const ledgerLink = (product) => {
  if (!product.certificateUrl) return '';
  return `<dd><a class="ledger-link" href="${escapeHtml(product.certificateUrl)}" target="_blank" rel="noopener noreferrer" title="Transacción pública que certificó esta garantía en el contrato Verifire (Stellar testnet)">Ver certificado en Stellar <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i><span class="visually-hidden"> (se abre en una pestaña nueva)</span></a></dd>`;
};

const warrantyCard = (product) => {
  const active = new Date(product.warrantyUntil).getTime() > Date.now();
  return `
    <article class="warranty-card">
      <div class="warranty-head">
        <div class="warranty-thumb" aria-hidden="true"><i class="fa-solid fa-box-open"></i></div>
        <div class="warranty-top">
          <span class="warranty-badge${active ? '' : ' is-expired'}"><i class="fa-solid ${active ? 'fa-shield-halved' : 'fa-clock-rotate-left'}" aria-hidden="true"></i> ${active ? 'VÁLIDO / PROTEGIDO' : 'COBERTURA VENCIDA'}</span>
          <h3>${escapeHtml(product.model)}</h3>
        </div>
      </div>
      <dl class="warranty-meta">
        <div><dt>Fecha de reclamo</dt><dd>${formatDay(product.claimedAt)}</dd></div>
        <div>
          <dt>Vigencia de la cobertura</dt>
          <dd>Garantía oficial hasta ${formatMonth(product.warrantyUntil)}</dd>
          ${ledgerLink(product)}
        </div>
      </dl>
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

// Accounts created before multi-device access existed need it saved once, from a browser that can already sign.
// It happens by itself when the login left the derived key in this tab; otherwise the profile menu offers it.
const enrollDeviceFactor = async (deviceCode) => {
  const address = walletAddress || storedUser()?.walletAddress || '';
  if (!isStellarAddress(address)) throw new Error('Todavía no encontramos tu wallet. Recargá la página e intentá de nuevo.');
  const wallet = await connectSigningWallet(address);
  await wallet.setupRecovery(deviceCode);
  const account = storedUser();
  if (account) localStorage.setItem('verifireUser', JSON.stringify({ ...account, deviceFactorAt: Date.now() }));
  enableDevicesButton.hidden = true;
};

const enableOtherDevices = async () => {
  const address = walletAddress || storedUser()?.walletAddress || '';
  if (!isStellarAddress(address) || await hasDeviceFactor(address) !== false) return;
  const deviceCode = storedDeviceCode();
  if (!deviceCode) {
    enableDevicesButton.hidden = false;
    return;
  }
  try {
    await enrollDeviceFactor(deviceCode);
    showMessage('Tu cuenta quedó habilitada para usarse en el celular: entrá ahí con tu correo y contraseña.', 'success');
  } catch (error) {
    enableDevicesButton.hidden = false;
    console.warn('No se pudo habilitar el uso en varios dispositivos:', error.message);
  }
};

const handleEnableDevices = async (event) => {
  event.preventDefault();
  const button = enableDevicesForm.querySelector('button[type="submit"]');
  const password = enableDevicesPassword.value.trim();
  const account = storedUser();
  if (!password) return;
  button.disabled = true;
  showMessage('Habilitando tu cuenta para otros dispositivos...', 'info');
  try {
    if (!(await verifyPassword(account, password))) throw new Error('Esa no es la contraseña de tu cuenta en este navegador.');
    await enrollDeviceFactor(await deviceCodeFor(account.email, password));
    enableDevicesForm.hidden = true;
    enableDevicesPassword.value = '';
    showMessage('Listo: ya podés entrar desde el celular con tu correo y tu contraseña.', 'success');
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    button.disabled = false;
  }
};

const setScannedClaim = (claim) => {
  scannedClaim = claim;
  claimForm.hidden = !claim;
};

// ---- Activation on Stellar ----
// The secret QR becomes an ed25519 key here (same derivation as the contract and stellar.mjs). The browser signs
// the activation with it and sends only the public key and the signature: the secret never leaves this page.

const ACTIVATION_DOMAIN = 'verifire-activation-v1';
// PKCS#8 header for a raw 32-byte Ed25519 private key, which WebCrypto cannot import as "raw".
const ED25519_PKCS8_HEADER = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];

const base64ToBytes = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
const bytesToBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const base64UrlToBytes = (value) => base64ToBytes(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='));
const bytesToHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

// Same decoding as secretFromQrKey + normalizeId in server.mjs.
const secretFromClaim = (claim) => {
  try {
    if (claim.secret) return String(claim.secret).trim().toUpperCase();
    const key = String(claim.qr || '');
    if (key.startsWith('.')) return new TextDecoder().decode(base64UrlToBytes(key.slice(1))).trim().toUpperCase();
    const bytes = base64UrlToBytes(key);
    return bytes.length === 10 ? `VF-SECRET-${bytesToHex(bytes).toUpperCase()}` : '';
  } catch {
    return '';
  }
};

const deriveActivationKey = async (secret) => {
  if (!window.crypto?.subtle) throw new Error('Abrí Verifire con https:// o desde localhost para activar garantías.');
  const seed = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ACTIVATION_DOMAIN}:${secret}`)));
  try {
    const privateKey = await crypto.subtle.importKey('pkcs8', new Uint8Array([...ED25519_PKCS8_HEADER, ...seed]), { name: 'Ed25519' }, true, ['sign']);
    const { x } = await crypto.subtle.exportKey('jwk', privateKey);
    return { privateKey, publicKey: bytesToHex(base64UrlToBytes(x)) };
  } catch {
    throw new Error('Este navegador no puede firmar la activación. Actualizalo o probá con una versión reciente de Chrome, Edge, Firefox o Safari.');
  }
};

const postJson = async (url, body, fallbackError) => {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await readResponse(response);
  if (!response.ok) throw Object.assign(new Error(data.error || fallbackError), { status: response.status, retryable: Boolean(data.retryable) });
  return data;
};

// The contract can only authorize an account that exists on-chain, and a Cavos account is created on its first
// transaction. The kit creates it (sponsored by Cavos) before the payment it is asked for; that 1-stroop payment
// can fail because the new account holds no XLM, which does not matter once the account exists.
const ensureAccountCreated = async (wallet, feeAccount) => {
  if (wallet.status !== 'undeployed') return;
  showMessage('Creando tu cuenta en Stellar por única vez...', 'info');
  try {
    await wallet.execute(1n, feeAccount);
  } catch (error) {
    if (wallet.status !== 'ready') throw new Error(`No se pudo crear tu cuenta en Stellar: ${error.message}`);
  }
};

const activateOnStellar = async (activation, owner, prepared) => {
  const request = { activationKey: activation.publicKey, owner };
  showMessage('Conectando tu wallet Cavos...', 'info');
  const wallet = await connectSigningWallet(owner);
  await ensureAccountCreated(wallet, prepared.feeAccount);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, activation.privateKey, base64ToBytes(prepared.message)));
  const { xdr } = await postJson('/api/warranties/transaction', { ...request, signature: bytesToBase64(signature) }, 'No se pudo preparar la activación en Stellar.');
  showMessage('Autorizando la activación con tu wallet Cavos...', 'info');
  const signedXdr = await wallet.signXdr(xdr);
  showMessage('Registrando tu garantía en Stellar. Puede tardar unos segundos...', 'info');
  return postJson('/api/warranties', { ...request, signedXdr }, 'No se pudo registrar la activación en Stellar.');
};

// Uses the contract when the server has one. Without it, or for the seed product that has no secret code (the
// server does not know its key and answers 404), falls back to the demo claim stored only in the server.
const activateWarranty = async (claim, owner) => {
  const secret = secretFromClaim(claim);
  if (secret) {
    const activation = await deriveActivationKey(secret);
    let prepared = null;
    try {
      prepared = await postJson('/api/warranties/prepare', { activationKey: activation.publicKey, owner }, 'No se pudo preparar la activación.');
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    if (prepared?.onChain) return activateOnStellar(activation, owner, prepared);
  }
  return postJson('/api/warranties', { ...claim, owner }, 'No se pudo activar la garantía.');
};

// The wallet cannot be reconnected without confirming the Gmail again: keep the QR and ask for a code at login.
const requireEmailCode = () => {
  const account = storedUser();
  if (account) localStorage.setItem('verifireUser', JSON.stringify({ ...account, emailVerifiedAt: 0 }));
  sessionStorage.setItem(PENDING_QR_KEY, JSON.stringify(scannedClaim));
  leaveSession('verificar');
};

const handleClaim = async (event) => {
  event.preventDefault();
  if (!scannedClaim) {
    showMessage('Primero escaneá el QR de la etiqueta interna del producto.', 'error');
    return;
  }

  const button = claimForm.querySelector('button');
  button.disabled = true;
  showMessage('Verificando el QR y preparando tu garantía...', 'info');
  try {
    const owner = walletAddress || await resolveWalletAddress();
    const product = await activateWarranty(scannedClaim, owner);
    setScannedClaim(null);
    showMessage(product.certificateUrl
      ? `¡Listo! La garantía de ${product.model} quedó registrada en Stellar a tu nombre.`
      : `¡Listo! La garantía de ${product.model} quedó activada a tu nombre.`, 'success');
    await loadWarranties();
  } catch (error) {
    if (error.code === 'needs-email-code') {
      requireEmailCode();
      return;
    }
    // A QR that does not exist or was already used will not work on a retry.
    if (error.status < 500 && !error.retryable) setScannedClaim(null);
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
  if (action === 'enable-devices') {
    setProfileOpen(false);
    enableDevicesForm.hidden = false;
    enableDevicesPassword.focus();
  }
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
  enableDevicesForm.addEventListener('submit', handleEnableDevices);
  enableDevicesCancel.addEventListener('click', () => {
    enableDevicesForm.hidden = true;
  });
  scanStart.addEventListener('click', startCamera);
  scanStop.addEventListener('click', stopCamera);
  scanFile.addEventListener('change', readQrPhoto);
  window.addEventListener('pagehide', stopCamera);
  loadWarranties().then(enableOtherDevices);

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
