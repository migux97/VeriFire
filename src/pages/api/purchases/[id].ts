import type { APIRoute } from 'astro';
import { publicBaseUrl } from '@/lib/server/config';
import { errorResponse, json } from '@/lib/server/http';
import { findPurchase, purchaseStatus } from '@/lib/server/purchases';

// Checks the payment and returns the batch with its secret codes and QR images: a purchase id is the key to them.
// With ?summary=1 it returns only the summary, for the list of batches.
export const GET: APIRoute = async ({ params, url }) => {
  const purchase = params.id ? findPurchase(params.id) : undefined;
  if (!purchase) return json({ error: 'La compra no existe.' }, 404);
  try {
    return json(await purchaseStatus(purchase, { summaryOnly: url.searchParams.has('summary'), baseUrl: publicBaseUrl(url) }));
  } catch (error) {
    return errorResponse(error, 502, 'No se pudo consultar automáticamente el pago.', 'Cosmos automatic status error:');
  }
};
