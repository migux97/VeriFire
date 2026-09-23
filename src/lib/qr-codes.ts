// What the QR codes of a product carry, and how a scanned one is read. Pure: no browser, no server, so the rules
// live in one place and are covered by tests (see tests/qr-codes.test.mjs).

// What a secret QR carries. It is sent to the server on activation and never shown.
export type ScannedClaim = { qr: string } | { secret: string };

// Secret of a transfer link (/app#t=...): random bytes in base64url, created by the owner's browser.
const TRANSFER_SECRET = /^[A-Za-z0-9_-]{16,64}$/;
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
