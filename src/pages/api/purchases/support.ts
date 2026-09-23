import type { APIRoute } from 'astro';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';
import { updateSupport } from '@/lib/server/support';

// The company's warranty settings (support email, warranty length) applied to its purchases and batches. The purchase
// ids travel in the body: each one is the key to its batch's secret codes.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    rateLimit('purchases-support', clientAddress, 20);
    return json(updateSupport(await readJsonBody(request, 'Purchase support error:')));
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo guardar la configuración de garantías.', 'Purchase support error:');
  }
};
