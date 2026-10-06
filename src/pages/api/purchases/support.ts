import type { APIRoute } from 'astro';
import { ownedPurchaseIds } from '@/lib/server/company-session';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';
import { updateSupport } from '@/lib/server/support';

// The company's warranty settings (support email, warranty length) applied to its purchases and batches. Only the
// purchases of the signed-in wallet are changed (see company-session.ts); the ids still travel in the body.
export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  try {
    rateLimit('purchases-support', clientAddress, 20);
    const body = await readJsonBody(request, 'Purchase support error:');
    return json(updateSupport({ ...body, purchaseIds: ownedPurchaseIds(cookies, body['purchaseIds']) }));
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo guardar la configuración de garantías.', 'Purchase support error:');
  }
};
