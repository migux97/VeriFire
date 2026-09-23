// Keeping a scanned QR across the login, and reading one from a camera frame or an image. What the codes mean is
// in src/lib/qr-codes.ts.
import { claimFromLink, isTransferSecret, transferFromLink, type ScannedClaim } from '../qr-codes';
import { readRaw, readStored, removeStored, writeRaw } from './storage';

const PENDING_QR_KEY = 'verifirePendingQr';
const PENDING_TRANSFER_KEY = 'verifirePendingTransfer';

// Opening a secret QR or a transfer link: keep it across the login redirect and remove it from the address bar.
export const captureClaimLink = () => {
  const claim = claimFromLink(window.location.search, window.location.hash);
  const transfer = transferFromLink(window.location.hash);
  if (!claim && !transfer) return;
  if (claim) keepPendingClaim(claim);
  if (transfer) keepPendingTransfer(transfer);
  window.history.replaceState({}, document.title, window.location.pathname);
};

export const keepPendingTransfer = (secret: string) => writeRaw(sessionStorage, PENDING_TRANSFER_KEY, secret);

// The transfer link kept across the login, removed as it is read.
export const takePendingTransfer = () => {
  const secret = readRaw(sessionStorage, PENDING_TRANSFER_KEY);
  removeStored(sessionStorage, PENDING_TRANSFER_KEY);
  return secret && isTransferSecret(secret) ? secret : null;
};

export const keepPendingClaim = (claim: ScannedClaim) => writeRaw(sessionStorage, PENDING_QR_KEY, JSON.stringify(claim));

export const hasPendingClaim = () => Boolean(readRaw(sessionStorage, PENDING_QR_KEY));

const isScannedClaim = (value: unknown): value is ScannedClaim =>
  typeof value === 'object' && value !== null
  && (typeof (value as { qr?: unknown }).qr === 'string' || typeof (value as { secret?: unknown }).secret === 'string');

// The claim kept across the login, removed as it is read. 'invalid' when something was kept but cannot be used.
export const takePendingClaim = (): ScannedClaim | 'invalid' | null => {
  if (!hasPendingClaim()) return null;
  const claim = readStored<unknown>(sessionStorage, PENDING_QR_KEY);
  removeStored(sessionStorage, PENDING_QR_KEY);
  return isScannedClaim(claim) ? claim : 'invalid';
};

// BarcodeDetector is not in TypeScript's DOM library yet.
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

export type QrSource = HTMLVideoElement | ImageBitmap;

// Uses the browser's native BarcodeDetector when available and falls back to jsQR (Safari, Firefox), loaded only
// when it is needed. Returns the text of the QR found in a video frame or image, or null.
export const createQrDecoder = () => {
  let detector: BarcodeDetectorLike | null = null;
  try {
    const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (Detector) detector = new Detector({ formats: ['qr_code'] });
  } catch {
    detector = null;
  }
  let context: CanvasRenderingContext2D | null = null;

  const loadJsQr = async () => {
    try {
      return (await import('jsqr')).default;
    } catch {
      throw new Error('No se pudo cargar el lector de QR. Revisá tu conexión e intentá de nuevo.');
    }
  };

  return async (source: QrSource, width: number, height: number): Promise<string | null> => {
    if (detector) {
      try {
        const [code] = await detector.detect(source);
        return code?.rawValue ?? null;
      } catch {
        detector = null;
      }
    }
    const jsQR = await loadJsQr();
    const scale = Math.min(1, 800 / Math.max(width, height));
    const scaledWidth = Math.round(width * scale);
    const scaledHeight = Math.round(height * scale);
    context ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.canvas.width = scaledWidth;
    context.canvas.height = scaledHeight;
    context.drawImage(source, 0, 0, scaledWidth, scaledHeight);
    return jsQR(context.getImageData(0, 0, scaledWidth, scaledHeight).data, scaledWidth, scaledHeight)?.data ?? null;
  };
};
