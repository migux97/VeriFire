import type { APIRoute } from 'astro';
import { prepareClaim } from '@/lib/server/claims';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';

export const POST: APIRoute = async ({ request }) => {
  try {
    return json(await prepareClaim(await readJsonBody(request, 'Claim request error:')));
  } catch (error) {
    return errorResponse(error, 502, 'No se pudo preparar la activación en Stellar.', 'Stellar prepare error:');
  }
};
