import type { APIRoute } from 'astro';
import { errorResponse, json } from '@/lib/server/http';
import { findPurchase, shipBatch } from '@/lib/server/purchases';

// The company marks the batch of a purchase as shipped: every product records it in its history. The purchase id
// is the company's key to its batch, as in GET /api/purchases/:id.
export const POST: APIRoute = ({ params }) => {
  const purchase = params.id ? findPurchase(params.id) : undefined;
  if (!purchase) return json({ error: 'La compra no existe.' }, 404);
  try {
    return json(shipBatch(purchase));
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo marcar el lote como despachado.', 'Ship batch error:');
  }
};
