import type { APIRoute } from 'astro';
import { PHOTO_REQUEST_LIMIT } from '@/lib/photo';
import { assertPurchaseOwner } from '@/lib/server/company-session';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';
import { findPurchase } from '@/lib/server/purchases';
import { setPurchasePhoto } from '@/lib/server/photos';
import { rateLimit } from '@/lib/server/rate-limit';

// Adds, replaces or removes (photo: null) the photo of a batch, only for the wallet that owns its purchase (see
// company-session.ts). The request is bigger than the others because the photo travels in it.
export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  try {
    rateLimit('purchases-photo', clientAddress, 20);
    const body = await readJsonBody(request, 'Purchase photo error:', PHOTO_REQUEST_LIMIT);
    const purchase = typeof body['purchaseId'] === 'string' ? findPurchase(body['purchaseId']) : undefined;
    if (purchase) assertPurchaseOwner(cookies, purchase);
    return json(setPurchasePhoto(body));
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo guardar la foto del lote.', 'Purchase photo error:');
  }
};
