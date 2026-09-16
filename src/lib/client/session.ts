// The account stays in this browser; the session in front of it lasts 8 hours from login.
// Imported by page frontmatter for its constants, so nothing here touches the browser at module load.
import { readStored, writeStored } from './storage';

export const SESSION_KEY = 'verifireAuthSession';
export const SESSION_MAX_MS = 8 * 60 * 60 * 1000;
const SESSION_CHECK_MS = 60 * 1000;
export const WALLET_KEY = 'verifireWallet';
// The key derived from the password that opens the signing key on any device. It lives in sessionStorage so the
// panel can finish enabling an account whose login could not, and it dies with the tab.
export const DEVICE_CODE_KEY = 'verifireDeviceCode';

// Shown by the login page after leaving a session (see sessionNotices in the auth panel).
export type SessionEndReason = 'expirada' | 'cerrada' | 'verificar';

interface StoredSession {
  email: string;
  startedAt: number;
}

export const userSession = {
  read: () => readStored<StoredSession>(localStorage, SESSION_KEY),
  isActive: () => {
    const session = userSession.read();
    return Boolean(session) && Date.now() - Number(session?.startedAt) < SESSION_MAX_MS;
  },
  email: () => userSession.read()?.email ?? '',
  start: (email: string) => writeStored(localStorage, SESSION_KEY, { email, startedAt: Date.now() }),
  // Removes everything that lets this browser act as the user, but keeps the account and the Cavos device keys
  // (IndexedDB), so logging in again recovers the same wallet.
  end: () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(WALLET_KEY);
    sessionStorage.removeItem(DEVICE_CODE_KEY);
    sessionStorage.removeItem('verifireSession');
    sessionStorage.removeItem(WALLET_KEY);
    for (const storage of [localStorage, sessionStorage]) {
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => Boolean(key?.startsWith('cavos-kit:identity:') || key?.startsWith('cavos-kit:token:')))
        .forEach((key) => storage.removeItem(key));
    }
  }
};

export const leaveSession = (reason: SessionEndReason) => {
  userSession.end();
  window.location.replace(`/acceso?sesion=${reason}`);
};

// For pages behind login. Without an active session it clears any stale one and sends the user to the login page.
// With one, it ends the session here as soon as it expires or is closed in another tab.
export const guardSession = () => {
  if (!userSession.isActive()) {
    const hadSession = Boolean(userSession.read());
    if (hadSession) userSession.end();
    window.location.replace(hadSession ? '/acceso?sesion=expirada' : '/acceso');
    return;
  }

  // Activity does not extend the session: it always ends 8 hours after login.
  const check = () => {
    if (!userSession.isActive()) leaveSession('expirada');
  };
  window.setInterval(check, SESSION_CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_KEY && !event.newValue) leaveSession('cerrada');
  });
};
