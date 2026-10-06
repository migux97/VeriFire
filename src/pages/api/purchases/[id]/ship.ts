import type { APIRoute } from 'astro';
import { assertPurchaseOwner } from '@/lib/server/company-session';
import { errorResponse, json } from '@/lib/server/http';
import { findPurchase, shipBatch } from '@/lib/server/purchases';
import { rateLimit } from '@/lib/server/rate-limit';

// The company marks the batch of a purchase as shipped: every product records it in its history. Only the wallet
// that owns the purchase may do it, as in GET /api/purchases/:id.
export const POST: APIRoute = ({ params, clientAddress, cookies }) => {
  try {
    rateLimit('purchase-ship', clientAddress, 20);
    const purchase = params.id ? findPurchase(params.id) : undefined;
    if (!purchase) return json({ error: 'La compra no existe.' }, 404);
    assertPurchaseOwner(cookies, purchase);
    return json(shipBatch(purchase));
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo marcar el lote como despachado.', 'Ship batch error:');
  }
};
