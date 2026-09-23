import type { APIRoute } from 'astro';
import { publicBaseUrl } from '@/lib/server/config';
import { errorResponse, json } from '@/lib/server/http';
import { findBatch, publicBatchView } from '@/lib/server/purchases';
import { rateLimit } from '@/lib/server/rate-limit';

export const GET: APIRoute = async ({ params, url, clientAddress }) => {
  try {
    rateLimit('batch-view', clientAddress, 120);
    const batch = findBatch(params.id);
    if (!batch) return json({ error: 'El lote no existe.' }, 404);
    return json(await publicBatchView(batch, publicBaseUrl(url)));
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo consultar el lote.', 'Batch view error:');
  }
};
