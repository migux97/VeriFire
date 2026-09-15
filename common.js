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

// The account (verifireUser) stays in this browser; the session in front of it ends after
// 8 hours without activity or 7 days after login, whichever comes first.
const SESSION_KEY = 'verifireAuthSession';
const WALLET_KEY = 'verifireWallet';
const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
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
    const now = Date.now();
    return Boolean(session) && now - session.startedAt < SESSION_MAX_MS && now - session.lastActivity < SESSION_IDLE_MS;
  },
  start(email) {
    const now = Date.now();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ email, startedAt: now, lastActivity: now }));
  },
  touch() {
    const session = this.read();
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, lastActivity: Date.now() }));
  },
  // Removes everything that lets this browser act as the user, but keeps the account and the
  // Cavos device keys (IndexedDB), so logging in again recovers the same wallet.
  end() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(WALLET_KEY);
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

  userSession.touch();
  let lastTouch = Date.now();
  const check = () => {
    if (userSession.isActive()) return true;
    leaveSession('expirada');
    return false;
  };
  // Activity renews the session at most once per minute.
  const onActivity = () => {
    if (Date.now() - lastTouch < SESSION_CHECK_MS || !check()) return;
    lastTouch = Date.now();
    userSession.touch();
  };

  ['click', 'keydown', 'scroll', 'touchstart'].forEach((type) => window.addEventListener(type, onActivity, { passive: true }));
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

const rememberWallet = (address) => {
  if (isStellarAddress(address)) localStorage.setItem(WALLET_KEY, JSON.stringify({ address, connectedAt: new Date().toISOString() }));
};

// Connects the Stellar wallet of an identity Cavos authenticated (email code or Google): its token
// lets the Cavos registry verify who owns the address. The address is kept for the session.
const connectCavosWallet = async (auth, identity) => {
  const { Cavos } = await import('./cavos.bundle.mjs');
  const wallet = await Cavos.connect({
    chains: ['stellar'],
    defaultChain: 'stellar',
    network: 'testnet',
    appSalt: window.CAVOS_APP_SALT || 'verifire-demo',
    appId: window.CAVOS_APP_ID || undefined,
    identity,
    auth
  });
  const address = wallet.address || wallet.chainAddress('stellar');
  if (!isStellarAddress(address)) {
    throw new Error('Cavos no devolvió una dirección Stellar para esta cuenta. Revisá el App ID de Cavos.');
  }
  rememberWallet(address);
  return address;
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
