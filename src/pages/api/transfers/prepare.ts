import type { APIRoute } from 'astro';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';
import { prepareTransfer } from '@/lib/server/transfers';

export const POST: APIRoute = async ({ request }) => {
  try {
    return json(await prepareTransfer(await readJsonBody(request, 'Transfer request error:')));
  } catch (error) {
    return errorResponse(error, 502, 'No se pudo leer el link de transferencia.', 'Stellar transfer prepare error:');
  }
};
