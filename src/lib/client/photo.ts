// The photo of a batch, prepared in the browser and sent to the server (see photos.ts). Whatever the company picks is
// drawn on a white background at up to PHOTO_MAX_SIDE pixels and saved as a JPEG, lowering its quality until it fits:
// a photo from a phone weighs several MB, and it travels in one request.
import { PHOTO_LIMIT, PHOTO_MAX_SIDE } from '../photo';
import { postJson } from './api';

export type PhotoError = 'type' | 'size' | 'read';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_FILE_BYTES = 12 * 1024 * 1024;
const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45];

const load = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('read' satisfies PhotoError));
    };
    image.src = url;
  });

// A data URL that fits the limit of the server, or an Error whose message is a PhotoError.
export const preparePhoto = async (file: File): Promise<string> => {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error('type' satisfies PhotoError);
  if (file.size > MAX_PHOTO_FILE_BYTES) throw new Error('size' satisfies PhotoError);
  const image = await load(file);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) throw new Error('read' satisfies PhotoError);
  let side = PHOTO_MAX_SIDE;
  // Smaller quality first; when even the lowest does not fit, a smaller picture.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const scale = Math.min(1, side / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('read' satisfies PhotoError);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of QUALITIES) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= PHOTO_LIMIT) return dataUrl;
    }
    side = Math.round(side * 0.75);
  }
  throw new Error('size' satisfies PhotoError);
};

// Adds, replaces or removes (null) the photo of a batch. The answer is the address the server keeps it at.
export const saveBatchPhoto = (purchaseId: string, photo: string | null, fallbackError: string) =>
  postJson<{ photoUrl: string | null }>('/api/purchases/photo', { purchaseId, photo }, fallbackError);
