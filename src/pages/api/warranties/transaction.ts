import type { APIRoute } from 'astro';
import { buildClaimTransaction } from '@/lib/server/claims';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';

export const POST: APIRoute = async ({ request }) => {
  try {
    return json(await buildClaimTransaction(await readJsonBody(request, 'Claim request error:')));
  } catch (error) {
    return errorResponse(error, 502, 'No se pudo preparar la transacción de activación.', 'Stellar build error:');
  }
};
