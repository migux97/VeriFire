import type { APIRoute } from 'astro';
import { claimDemoWarranty, submitOnChainClaim, warrantiesOf } from '@/lib/server/claims';
import { publicBaseUrl } from '@/lib/server/config';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';

export const GET: APIRoute = ({ url }) => {
  try {
    return json(warrantiesOf(url.searchParams.get('owner') ?? '', publicBaseUrl(url)));
  } catch (error) {
    return errorResponse(error, 500, 'No se pudieron cargar las garantías.', 'List warranties error:');
  }
};

// Claim from the buyer's panel. With signedXdr it is the last on-chain step; otherwise it is the demo claim.
export const POST: APIRoute = async ({ request, url }) => {
  try {
    const body = await readJsonBody(request, 'Claim request error:');
    const baseUrl = publicBaseUrl(url);
    return json(body['signedXdr'] ? await submitOnChainClaim(body, baseUrl) : claimDemoWarranty(body, baseUrl));
  } catch (error) {
    return errorResponse(error, 502, 'No se pudo registrar la activación en Stellar.', 'Stellar claim error:');
  }
};
