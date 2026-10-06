// Who may read or change a purchase: the wallet that owns it, proven with the session cookie that POST /api/workspace
// sets after checking the wallet's signature. A purchase id alone used to be enough, and it opens the secret codes of
// a whole batch, so anyone who saw one (a log, a screenshot, a former teammate's browser) kept that key forever.
import { createHmac } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { HttpError } from './errors';
import { readSession, signSession } from './session-token';
import { saveState, store, type Purchase } from './store';

export const COMPANY_SESSION_COOKIE = 'verifire_company';
const SESSION_HOURS = 12;

// Derived from the random key kept with the data (see store.ts), so sessions survive a restart and no new setting is
// needed. Hashing with a label keeps it apart from the key's other use, the hashes of emails.
const sessionKey = () => createHmac('sha256', store.accountsKey).update('verifire:company-session').digest('hex');

export const startCompanySession = (cookies: AstroCookies, owner: string, secure: boolean) => {
  const maxAge = SESSION_HOURS * 60 * 60;
  cookies.set(COMPANY_SESSION_COOKIE, signSession(sessionKey(), owner, Date.now() + maxAge * 1000), {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/api',
    maxAge
  });
};

export const sessionOwner = (cookies: AstroCookies) => readSession(sessionKey(), cookies.get(COMPANY_SESSION_COOKIE)?.value);

// Throws unless the session's wallet owns the purchase. A purchase from before purchases had owners is claimed by the
// first signed-in wallet that holds its id, as POST /api/workspace already does.
export const assertPurchaseOwner = (cookies: AstroCookies, purchase: Purchase) => {
  const owner = sessionOwner(cookies);
  if (!owner) throw new HttpError(401, 'Iniciá sesión con la wallet de la empresa para ver este lote.');
  if (!purchase.owner) {
    purchase.owner = owner;
    try {
      saveState();
    } catch (error) {
      // Memory goes back to what the file still has.
      delete purchase.owner;
      throw error;
    }
  }
  // The same answer as an id that does not exist: someone else's purchase is not confirmed to be there.
  if (purchase.owner !== owner) throw new HttpError(404, 'La compra no existe.');
};

// Of the ids a request names, the ones the session's wallet owns (claiming those without an owner). Ids of other
// companies are left out quietly, the same as ids that do not exist.
export const ownedPurchaseIds = (cookies: AstroCookies, ids: unknown): string[] => {
  if (!sessionOwner(cookies)) throw new HttpError(401, 'Iniciá sesión con la wallet de la empresa para cambiar sus lotes.');
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => {
    const purchase = typeof id === 'string' ? store.purchases.get(id) : undefined;
    if (!purchase) return false;
    try {
      assertPurchaseOwner(cookies, purchase);
      return true;
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return false;
      throw error;
    }
  });
};
