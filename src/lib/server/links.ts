// The addresses printed inside QR codes, and the QR images themselves.
import QRCode from 'qrcode';

// Secret QR links carry an opaque key instead of the readable code: the 10 random bytes of VF-SECRET-<hex> in
// base64url, or "." + base64url for any other code. It goes after the #, so browsers never send it to the server
// when the page is requested.
const SECRET_PATTERN = /^VF-SECRET-([0-9A-F]{20})$/;

export const qrKeyFor = (secretCode: string) => {
  const match = SECRET_PATTERN.exec(secretCode);
  return match?.[1] ? Buffer.from(match[1], 'hex').toString('base64url') : `.${Buffer.from(secretCode).toString('base64url')}`;
};

// Same decoding as secretFromClaim in src/lib/client/activation.ts.
export const secretFromQrKey = (key: string) => {
  if (key.startsWith('.')) return Buffer.from(key.slice(1), 'base64url').toString('utf8');
  const bytes = Buffer.from(key, 'base64url');
  return bytes.length === 10 ? `VF-SECRET-${bytes.toString('hex').toUpperCase()}` : '';
};

export const pageUrl = (baseUrl: string, path: string, params?: Record<string, string>) =>
  `${baseUrl}${path}${params ? `?${new URLSearchParams(params)}` : ''}`;

export const verificationUrl = (baseUrl: string, token: string) => pageUrl(baseUrl, '/verify', { token });
export const batchUrl = (baseUrl: string, batchId: string) => pageUrl(baseUrl, '/batch', { batch: batchId });
export const activationUrl = (baseUrl: string) => pageUrl(baseUrl, '/app');
export const secretUrl = (baseUrl: string, secretCode: string) => `${activationUrl(baseUrl)}#q=${qrKeyFor(secretCode)}`;

// QR images are generated here: secret codes must never be sent to a third-party QR service.
export const qrImage = async (text: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }))}`;
