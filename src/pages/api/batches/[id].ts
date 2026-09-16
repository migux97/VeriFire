import type { APIRoute } from 'astro';
import { publicBaseUrl } from '@/lib/server/config';
import { json } from '@/lib/server/http';
import { findBatch, publicBatchView } from '@/lib/server/purchases';

export const GET: APIRoute = ({ params, url }) => {
  const batch = findBatch(params.id);
  if (!batch) return json({ error: 'El lote no existe.' }, 404);
  return json(publicBatchView(batch, publicBaseUrl(url)));
};
