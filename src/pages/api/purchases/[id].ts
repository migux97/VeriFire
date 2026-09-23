import type { APIRoute } from 'astro';
import { publicBaseUrl } from '@/lib/server/config';
import { errorResponse, json } from '@/lib/server/http';
import { findPurchase, purchaseStatus } from '@/lib/server/purchases';

// Checks the payment and returns the summary of the purchase: how it is going, how many tokens it has and how many
// were activated. The secret codes are answered only by POST /api/purchases/detail, so they never travel in a URL.
export const GET: APIRoute = async ({ params, url }) => {
  const purchase = params.id ? findPurchase(params.id) : undefined;
  if (!purchase) return json({ error: 'La compra no existe.' }, 404);
  try {
    return json(await purchaseStatus(purchase, { summaryOnly: true, baseUrl: publicBaseUrl(url) }));
  } catch (error) {
    return errorResponse(error, 502, 'No se pudo consultar automáticamente el pago.', 'Cosmos automatic status error:');
  }
};
