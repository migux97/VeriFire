// The photo of a batch. A company adds it to a batch it bought (the purchase id, the key to its codes, is the proof),
// and from then on it is what every product of the batch looks like: on the buyer's warranty, on the public QR pages
// and, when a buyer chooses so, on the home page. It is kept in the purchase, beside the data of the batch.
import { createHash } from 'node:crypto';
import { photoFormat, photoMime } from '../photo';
import { HttpError } from './errors';
import type { JsonBody } from './http';
import { saveState, store, type Purchase } from './store';

export const purchaseOfBatch = (batchId: string | undefined): Purchase | undefined =>
  batchId ? [...store.purchases.values()].find((purchase) => purchase.batchId === batchId) : undefined;

// The address of the photo of a batch, or null. It changes with the photo, so a browser never shows an old one.
export const photoPathOf = (purchase: Purchase | undefined) =>
  purchase?.photo && purchase.batchId ? `/api/batches/${encodeURIComponent(purchase.batchId)}/photo?v=${purchase.photoVersion ?? ''}` : null;

export const photoOfBatch = (batchId: string | undefined) => photoPathOf(purchaseOfBatch(batchId));

export const photoBytes = (batchId: string) => {
  const purchase = purchaseOfBatch(batchId);
  const format = purchase?.photo ? photoFormat(purchase.photo) : null;
  if (!purchase?.photo || !format) return null;
  return { bytes: Buffer.from(purchase.photo.slice(purchase.photo.indexOf(',') + 1), 'base64'), mime: photoMime(format) };
};

// Sets or removes (photo: null) the photo of a purchase. The purchase id is the key, as it is for its codes.
const UNPAID_PHOTO_WINDOW_MS = 15 * 60 * 1000;

export const setPurchasePhoto = (body: JsonBody) => {
  const purchaseId = typeof body['purchaseId'] === 'string' ? body['purchaseId'] : '';
  const purchase = store.purchases.get(purchaseId);
  if (!purchase) throw new HttpError(404, 'La compra no existe.');
  // The form uploads it right after creating the purchase; later, only a paid one takes a photo. Unpaid purchases are
  // free to create, and their photos would otherwise pile up in the state file.
  const fresh = Date.now() - Date.parse(purchase.createdAt ?? '') < UNPAID_PHOTO_WINDOW_MS;
  if (!purchase.batchId && !fresh) throw new HttpError(409, 'La foto se puede cargar cuando el lote esté pagado.');
  const photo = body['photo'];
  const previous = { photo: purchase.photo, photoVersion: purchase.photoVersion };
  if (photo === null) {
    delete purchase.photo;
    delete purchase.photoVersion;
  } else {
    if (typeof photo !== 'string' || !photoFormat(photo)) {
      throw new HttpError(413, 'La foto no es válida o pesa demasiado. Usá una imagen JPG, PNG o WebP.');
    }
    purchase.photo = photo;
    purchase.photoVersion = createHash('sha256').update(photo).digest('hex').slice(0, 8);
  }
  try {
    saveState();
  } catch (error) {
    // Back to the photo it had: the answer to this request is an error, so nothing changed for whoever asked.
    if (previous.photo) Object.assign(purchase, previous);
    else {
      delete purchase.photo;
      delete purchase.photoVersion;
    }
    throw error;
  }
  return { photoUrl: photoPathOf(purchase) };
};
