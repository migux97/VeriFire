import type { APIRoute } from 'astro';
import { PHOTO_REQUEST_LIMIT } from '@/lib/photo';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';
import { setPurchasePhoto } from '@/lib/server/photos';
import { rateLimit } from '@/lib/server/rate-limit';

// Adds, replaces or removes (photo: null) the photo of a batch. The purchase id travels in the body: it is the key to
// the batch, as for its secret codes. The request is bigger than the others because the photo travels in it.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    rateLimit('purchases-photo', clientAddress, 20);
    return json(setPurchasePhoto(await readJsonBody(request, 'Purchase photo error:', PHOTO_REQUEST_LIMIT)));
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo guardar la foto del lote.', 'Purchase photo error:');
  }
};
