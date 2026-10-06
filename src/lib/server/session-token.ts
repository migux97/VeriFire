// A short proof, kept in a cookie, that the browser signed a nonce with a wallet a moment ago (see wallet-auth.ts).
// Signing for every request would ask the wallet over and over; this remembers the last signature for a few hours.
//
// The token is the wallet, the moment it stops working and an HMAC of both. It holds nothing secret: it only proves
// that this server issued it.
import { createHmac, timingSafeEqual } from 'node:crypto';

// The same shape as isStellarAddress (validation.ts), repeated so this file imports nothing of the app and the tests
// can load it on its own.
const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

const mac = (key: string, payload: string) => createHmac('sha256', key).update(payload).digest('base64url');

export const signSession = (key: string, owner: string, until: number) => {
  const payload = `${owner}.${until}`;
  return `${payload}.${mac(key, payload)}`;
};

// The wallet the token speaks for, or null when it is not one of ours, was altered or has expired.
export const readSession = (key: string, token: string | undefined, now = Date.now()): string | null => {
  const [owner, until, signature, ...rest] = (token ?? '').split('.');
  if (!owner || !until || !signature || rest.length || !STELLAR_ADDRESS.test(owner)) return null;
  const expected = Buffer.from(mac(key, `${owner}.${until}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return Number(until) > now ? owner : null;
};
