import type { APIRoute } from 'astro';
import { errorResponse, json, readJson } from '@/lib/server/http';
import { createBatchPayment, paymentsConfigured } from '@/lib/server/purchases';

export const POST: APIRoute = async ({ request }) => {
  if (!paymentsConfigured()) {
    return json({ error: 'Configura COSMOS_PAY_API_KEY y COSMOS_PAY_DESTINATION para usar pagos de prueba.' }, 503);
  }
  try {
    return json(await createBatchPayment(await readJson(request)), 201);
  } catch (error) {
    return errorResponse(error, 502, 'No se pudo crear el pago de la emisión.', 'Cosmos batch payment error:');
  }
};
