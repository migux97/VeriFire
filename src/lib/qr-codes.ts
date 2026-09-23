// What the QR codes of a product carry, and how a scanned or typed code is read. Pure: no browser, no server, so the
// rules live in one place and are covered by tests (see tests/manual-code.test.mjs).

// What a secret QR carries. It is sent to the server on activation and never shown.
export type ScannedClaim = { qr: string } | { secret: string };

// Secret of a transfer link (/app#t=...): random bytes in base64url, created by the owner's browser.
const TRANSFER_SECRET = /^[A-Za-z0-9_-]{16,64}$/;
// The printed code inside the package.
const SECRET_CODE = /^VF-SECRET-(?:[0-9A-F]{20}|DEMO-\d{3})$/i;
// The opaque key of a secret QR: base64url of 10 bytes, or the shorter dotted form of the first labels.
const QR_KEY = /^[A-Za-z0-9_-]{13}[AQgw]$/;
const DOTTED_QR_KEY = /^\.[A-Za-z0-9_-]{1,256}$/;
// Longer than any code Verifire prints: whatever it is, it is not one.
const MAX_CODE_LENGTH = 2048;

export const isTransferSecret = (value: string) => TRANSFER_SECRET.test(value);

export const transferFromLink = (hash: string): string | null => {
  const secret = new URLSearchParams(hash.replace(/^#/, '')).get('t');
  return secret && isTransferSecret(secret) ? secret : null;
};

// Secret QR links carry an opaque key (/app#q=...). Labels printed before used ?codigo= or ?secret=.
export const claimFromLink = (search: string, hash: string): ScannedClaim | null => {
  const qr = new URLSearchParams(hash.replace(/^#/, '')).get('q');
  if (qr) return { qr };
  const params = new URLSearchParams(search);
  const secret = params.get('codigo') || params.get('secret');
  return secret ? { secret } : null;
};

// What a scanned QR turns out to be: the secret one of a product, the public one, or a transfer link.
export const parseScannedQr = (text: string): { claim: ScannedClaim | null; publicToken: string | null; transfer: string | null } => {
  try {
    const url = new URL(text.trim());
    return { claim: claimFromLink(url.search, url.hash), publicToken: url.searchParams.get('token'), transfer: transferFromLink(url.hash) };
  } catch {
    return { claim: null, publicToken: null, transfer: null };
  }
};

// Manual entry accepts the printed private code, an opaque QR key, or the complete activation URL.
// This only checks the format. Ownership and authenticity are checked by the existing activation flow.
export const parseManualCode = (text: string): ScannedClaim | null => {
  const value = text.trim();
  if (!value || value.length > MAX_CODE_LENGTH) return null;
  const validKey = (key: string) => QR_KEY.test(key) || DOTTED_QR_KEY.test(key);
  const claim = parseScannedQr(value).claim;
  if (claim) {
    if ('secret' in claim) return SECRET_CODE.test(claim.secret) ? { secret: claim.secret.toUpperCase() } : null;
    return validKey(claim.qr) ? claim : null;
  }
  if (SECRET_CODE.test(value)) return { secret: value.toUpperCase() };
  return validKey(value) ? { qr: value } : null;
};
