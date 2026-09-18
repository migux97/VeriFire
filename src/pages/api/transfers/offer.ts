import type { APIRoute } from 'astro';
import { publicBaseUrl } from '@/lib/server/config';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';
import { offerTransfer } from '@/lib/server/transfers';

// Without signedXdr it answers the transaction for the user's wallet; with it, submits it (see transfers.ts).
export const POST: APIRoute = async ({ request, url }) => {
  try {
    return json(await offerTransfer(await readJsonBody(request, 'Transfer request error:'), publicBaseUrl(url)));
  } catch (error) {
    return errorResponse(error, 502, 'No se pudo abrir el link de transferencia.', 'Stellar transfer error:');
  }
};
