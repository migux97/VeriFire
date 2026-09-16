// Reading the QR codes of a product: links, camera frames and images.
import { readStored } from './storage';

// What a secret QR carries. It is sent to the server on activation and never shown.
export type ScannedClaim = { qr: string } | { secret: string };

const PENDING_QR_KEY = 'verifirePendingQr';

// Secret QR links carry an opaque key (/app#q=...). Labels printed before used ?codigo= or ?secret=.
export const claimFromLink = (search: string, hash: string): ScannedClaim | null => {
  const qr = new URLSearchParams(hash.replace(/^#/, '')).get('q');
  if (qr) return { qr };
  const params = new URLSearchParams(search);
  const secret = params.get('codigo') || params.get('secret');
  return secret ? { secret } : null;
};

// Opening a QR link: keep it across the login redirect and remove it from the address bar.
export const captureClaimLink = () => {
  const claim = claimFromLink(window.location.search, window.location.hash);
  if (!claim) return;
  keepPendingClaim(claim);
  window.history.replaceState({}, document.title, window.location.pathname);
};

export const keepPendingClaim = (claim: ScannedClaim) => sessionStorage.setItem(PENDING_QR_KEY, JSON.stringify(claim));

export const hasPendingClaim = () => Boolean(sessionStorage.getItem(PENDING_QR_KEY));

const isScannedClaim = (value: unknown): value is ScannedClaim =>
  typeof value === 'object' && value !== null
  && (typeof (value as { qr?: unknown }).qr === 'string' || typeof (value as { secret?: unknown }).secret === 'string');

// The claim kept across the login, removed as it is read. 'invalid' when something was kept but cannot be used.
export const takePendingClaim = (): ScannedClaim | 'invalid' | null => {
  if (!hasPendingClaim()) return null;
  const claim = readStored<unknown>(sessionStorage, PENDING_QR_KEY);
  sessionStorage.removeItem(PENDING_QR_KEY);
  return isScannedClaim(claim) ? claim : 'invalid';
};

export const parseScannedQr = (text: string): { claim: ScannedClaim | null; publicToken: string | null } => {
  try {
    const url = new URL(text.trim());
    return { claim: claimFromLink(url.search, url.hash), publicToken: url.searchParams.get('token') };
  } catch {
    return { claim: null, publicToken: null };
  }
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
