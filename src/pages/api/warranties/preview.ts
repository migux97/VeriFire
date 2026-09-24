import type { APIRoute } from 'astro';
import { previewClaim } from '@/lib/server/claims';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';

// Step zero of an activation: what the product behind a secret QR looks like, so the buyer can decide about the home page.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    // Each call looks the key up among every product.
    rateLimit('claims-preview', clientAddress, 40);
    return json(previewClaim(await readJsonBody(request, 'Claim preview error:')));
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo consultar el producto.', 'Claim preview error:');
  }
};
