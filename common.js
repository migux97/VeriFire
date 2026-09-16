// Shared by every page; loaded first in <head>.

// Locally the app is served by server.mjs on port 5501, so other ports (e.g. Live Server) redirect there.
(() => {
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (localHosts.has(window.location.hostname) && window.location.port !== '5501') {
    window.location.replace(`http://${window.location.hostname}:5501${window.location.pathname}${window.location.search}${window.location.hash}`);
  }
})();

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

const readResponse = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : { error: `El servidor respondió vacío (${response.status}).` };
  } catch {
    return { error: `El servidor respondió con un formato inválido (${response.status}).` };
  }
};

const storedUser = () => {
  try {
    return JSON.parse(localStorage.getItem('verifireUser') || 'null');
  } catch {
    return null;
  }
};

const isStellarAddress = (value) => /^G[A-Z2-7]{55}$/.test(String(value || ''));

// ---- Passwords ----
// Only a salted PBKDF2 hash of the password is stored, and the key that opens the Cavos signing key on another
// device is derived from the same password: both are computed here and the password itself is never kept.

const PASSWORD_ITERATIONS = 310000;
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

const hashPassword = async (password, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = PASSWORD_ITERATIONS) => {
  if (!window.crypto?.subtle) {
    throw new Error('Abrí Verifire con HTTPS (o localhost) para poder proteger tu contraseña.');
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return { salt: toBase64(salt), hash: toBase64(new Uint8Array(bits)), iterations };
};

const verifyPassword = async (user, password) => {
  if (user?.passwordHash) {
    const { salt, hash, iterations } = user.passwordHash;
    return (await hashPassword(password, fromBase64(salt), iterations)).hash === hash;
  }
  // Accounts created before hashing kept the password in plain text.
  return Boolean(user?.password) && user.password === password;
};

const deviceCodeFor = async (email, password) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new TextEncoder().encode(`verifire-device-v1:${String(email).trim().toLowerCase()}`);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS }, key, 256);
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

// ---- Company purchases ----
// A purchase id is the key to the secret codes of its batch and there are no server-side company accounts, so the
// list of purchases is kept in this browser, per account. Shared by the buy page and the list of batches.

const LEGACY_PURCHASE_KEY = 'verifireLastPurchase';
const purchasesKey = () => `verifireCompanyPurchases:${String(userSession.read()?.email || '').toLowerCase()}`;

const savedPurchaseIds = () => {
  try {
    const list = JSON.parse(localStorage.getItem(purchasesKey()) || '[]');
    return Array.isArray(list) ? list.map((item) => item?.purchaseId).filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const writePurchaseIds = (ids) => {
  try {
    localStorage.setItem(purchasesKey(), JSON.stringify(ids.map((purchaseId) => ({ purchaseId }))));
  } catch {
    // Without storage the list only lasts while the page is open.
  }
};

const savePurchase = (purchaseId) => writePurchaseIds([purchaseId, ...savedPurchaseIds().filter((id) => id !== purchaseId)]);
const forgetPurchase = (purchaseId) => writePurchaseIds(savedPurchaseIds().filter((id) => id !== purchaseId));

// The panel used to keep only the last purchase under its own key; it moves into the list once.
const migrateLegacyPurchase = () => {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_PURCHASE_KEY) || 'null');
    if (legacy?.purchaseId && !savedPurchaseIds().includes(legacy.purchaseId)) savePurchase(legacy.purchaseId);
    localStorage.removeItem(LEGACY_PURCHASE_KEY);
  } catch {
    // A corrupt legacy entry is simply dropped.
  }
};

// With { summary: true } the answer carries no secret codes and no QR images: enough to list and count batches.
const fetchPurchase = async (purchaseId, { summary = false } = {}) => {
  const response = await fetch(`/api/purchases/${encodeURIComponent(purchaseId)}${summary ? '?summary=1' : ''}`);
  const data = await readResponse(response);
  if (!response.ok) throw Object.assign(new Error(data.error || 'No se pudo consultar la compra.'), { status: response.status });
  return data;
};

// The account (verifireUser) stays in this browser; the session in front of it lasts 8 hours from login.
const SESSION_KEY = 'verifireAuthSession';
const WALLET_KEY = 'verifireWallet';
// The key derived from the password that opens the signing key on any device. It lives in sessionStorage so the
// panel can finish enabling an account whose login could not, and it dies with the tab.
const DEVICE_CODE_KEY = 'verifireDeviceCode';
const SESSION_MAX_MS = 8 * 60 * 60 * 1000;
const SESSION_CHECK_MS = 60 * 1000;

const userSession = {
  read() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  },
  isActive() {
    const session = this.read();
    return Boolean(session) && Date.now() - session.startedAt < SESSION_MAX_MS;
  },
  start(email) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email, startedAt: Date.now() }));
  },
  // Removes everything that lets this browser act as the user, but keeps the account and the
  // Cavos device keys (IndexedDB), so logging in again recovers the same wallet.
  end() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(WALLET_KEY);
    sessionStorage.removeItem(DEVICE_CODE_KEY);
    sessionStorage.removeItem('verifireSession');
    sessionStorage.removeItem(WALLET_KEY);
    for (const storage of [localStorage, sessionStorage]) {
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key) => key.startsWith('cavos-kit:identity:') || key.startsWith('cavos-kit:token:'))
        .forEach((key) => storage.removeItem(key));
    }
  }
};

const leaveSession = (reason) => {
  userSession.end();
  window.location.replace(`index.html?sesion=${reason}`);
};

// For pages behind login. Returns whether a session is active. Without one it clears any stale
// session and, unless anonymous visitors are allowed, sends the user to the login page.
const guardSession = ({ allowAnonymous = false } = {}) => {
  if (!userSession.isActive()) {
    const hadSession = Boolean(userSession.read());
    if (hadSession) userSession.end();
    if (!allowAnonymous) window.location.replace(hadSession ? 'index.html?sesion=expirada' : 'index.html');
    return false;
  }

  // Activity does not extend the session: it always ends 8 hours after login.
  const check = () => {
    if (!userSession.isActive()) leaveSession('expirada');
  };

  window.setInterval(check, SESSION_CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  // Logging out or expiring in another tab ends the session here too.
  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_KEY && !event.newValue) leaveSession('cerrada');
  });
  return true;
};

const rememberDeviceCode = (deviceCode) => {
  try {
    if (deviceCode) sessionStorage.setItem(DEVICE_CODE_KEY, deviceCode);
  } catch {
    // Without storage the account is enabled at the next login instead.
  }
};

const storedDeviceCode = () => {
  try {
    return sessionStorage.getItem(DEVICE_CODE_KEY) || '';
  } catch {
    return '';
  }
};

const rememberWallet = (address) => {
  if (isStellarAddress(address)) localStorage.setItem(WALLET_KEY, JSON.stringify({ address, connectedAt: new Date().toISOString() }));
};

// Connects the Stellar wallet of an identity Cavos authenticated (email code or Google): its token
// lets the Cavos registry verify who owns the address. The address is kept for the session.
const openCavosWallet = async (auth, identity) => {
  const { Cavos } = await import('./cavos.bundle.mjs');
  const session = await Cavos.connect({
    chains: ['stellar'],
    defaultChain: 'stellar',
    network: 'testnet',
    appSalt: window.CAVOS_APP_SALT || 'verifire-demo',
    appId: window.CAVOS_APP_ID || undefined,
    identity,
    auth
  });
  const wallet = session.wallet?.('stellar') || session;
  if (!isStellarAddress(wallet.address)) {
    throw new Error('Cavos no devolvió una dirección Stellar para esta cuenta. Revisá el App ID de Cavos.');
  }
  return wallet;
};

// Cavos seals the signing key inside the account and each browser keeps its own copy of what opens it. The device
// factor derived from the password enrolls the first browser and unlocks every other device the user logs into, so
// a phone needs nothing beyond signing in.
// The multi-device factor is an encrypted wrap stored in the account itself (a cv:wr entry). Reading it apart tells
// an account that never saved one from a password that cannot open it: the kit reports both the same way.
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

const hasDeviceFactor = async (address) => {
  try {
    const response = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(address)}`);
    if (!response.ok) return null;
    const account = await response.json();
    return Object.keys(account.data || {}).some((key) => key.startsWith('cv:wr'));
  } catch {
    return null;
  }
};

// Enables this browser to sign, or explains why it could not. It never throws: the caller has already verified the
// user, and a login must not fail over this.
const authorizeDevice = async (wallet, deviceCode) => {
  if (wallet.status === 'needs-device-approval') {
    if (await hasDeviceFactor(wallet.address) === false) {
      return { ok: false, error: 'Tu cuenta todavía no tiene habilitado el uso en varios dispositivos. Abrí Verifire en la misma dirección donde la creaste (si fue en tu computadora, http://localhost:5501), entrá y habilitalo desde Mi perfil.' };
    }
    try {
      await wallet.approveThisDeviceWithRecovery(deviceCode);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: /wrong factor|not enrolled/i.test(error.message)
          ? 'No pudimos habilitar este dispositivo: la contraseña no abre la llave de tu cuenta. Entrá con la misma contraseña con la que la creaste.'
          : error.message
      };
    }
  }
  // Saves the factor of an account created before this existed; a new account saves it with its first login.
  try {
    await wallet.setupRecovery(deviceCode);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `No se pudo guardar el uso en varios dispositivos: ${error.message}` };
  }
};

const connectCavosWallet = async (auth, identity, deviceCode) => {
  const wallet = await openCavosWallet(auth, identity);
  rememberWallet(wallet.address);
  rememberDeviceCode(deviceCode);
  const device = deviceCode ? await authorizeDevice(wallet, deviceCode) : { ok: false, error: '' };
  return { address: wallet.address, deviceFactor: device.ok, deviceError: device.error || '' };
};

// A wallet able to sign on Stellar. A password-only login has no Cavos session, but the Cavos user id saved when
// the Gmail was verified reconnects the same wallet, whose keys stay in this browser's IndexedDB.
const connectSigningWallet = async (expectedAddress) => {
  const account = storedUser();
  const { CavosAuth } = await import('./cavos.bundle.mjs');
  const auth = new CavosAuth({ appId: window.CAVOS_APP_ID || undefined });
  const sameAccount = Boolean(account?.email) && account.email === userSession.read()?.email;
  const identity = auth.restoreIdentity() || (sameAccount && account.cavosUserId ? { userId: account.cavosUserId, email: account.email } : null);
  if (!identity) {
    throw Object.assign(new Error('Para firmar en Stellar necesitamos confirmar tu correo con un código.'), { code: 'needs-email-code' });
  }
  const wallet = await openCavosWallet(auth, identity);
  if (wallet.address !== expectedAddress) {
    throw new Error('La wallet Cavos de este navegador no coincide con la de tu cuenta. Cerrá sesión y volvé a entrar.');
  }
  // This browser is enabled while signing in (see authorizeDevice). Reaching here means that did not happen, which
  // is not a missing email code: the session stays open and the message says what to do.
  if (wallet.status === 'needs-device-approval') {
    // The signing key lives in this browser AND under this site address: localhost and the public URL are two
    // different places for it, even on the same computer.
    throw new Error(await hasDeviceFactor(wallet.address) === false
      ? 'Tu cuenta todavía no tiene habilitado el uso en varios dispositivos, y esta dirección del sitio no tiene su llave. Abrí Verifire donde creaste la cuenta (si fue en tu computadora, http://localhost:5501) y habilitalo ahí desde Mi perfil.'
      : 'Esta dirección del sitio todavía no puede firmar. Cerrá sesión, volvé a entrar con tu contraseña y probá de nuevo.');
  }
  if (typeof wallet.signXdr !== 'function') {
    throw new Error('Esta wallet Cavos no puede firmar en Stellar. Cerrá sesión y volvé a entrar.');
  }
  return wallet;
};

const resolveWalletAddress = async () => {
  try {
    const cached = JSON.parse(localStorage.getItem(WALLET_KEY) || 'null');
    if (isStellarAddress(cached?.address)) return cached.address;
  } catch {
    // A corrupt cache is replaced below.
  }
  // The account keeps the wallet linked when its Gmail was verified, so a new session does not reconnect to Cavos.
  const account = storedUser();
  if (isStellarAddress(account?.walletAddress) && account.email === userSession.read()?.email) {
    rememberWallet(account.walletAddress);
    return account.walletAddress;
  }
  const { CavosAuth } = await import('./cavos.bundle.mjs');
  const auth = new CavosAuth({ appId: window.CAVOS_APP_ID || undefined });
  const identity = auth.restoreIdentity();
  if (!identity) throw new Error('No encontramos tu cuenta Cavos en este navegador. Cerrá sesión y volvé a entrar.');
  return connectCavosWallet(auth, identity);
};
