import type { APIRoute } from 'astro';
import { publicBaseUrl } from '@/lib/server/config';
import { errorResponse, json, readJsonBody, textField } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';
import { setShowcase, showcaseItems } from '@/lib/server/showcase';
import { assertWalletOwner } from '@/lib/server/wallet-auth';

// The latest verified products whose owners chose to show them: what the home page carousel reads.
export const GET: APIRoute = ({ clientAddress }) => {
  try {
    rateLimit('showcase', clientAddress, 120);
    return Response.json({ items: showcaseItems() }, { headers: { 'Cache-Control': 'public, max-age=30' } });
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo leer la portada.', 'Showcase error:');
  }
};

// The owner shows or hides one of its products. It is signed with its wallet like any change to its account: the
// address of a product's owner is not a secret, so nothing else would prove who asks.
export const POST: APIRoute = async ({ request, clientAddress, url }) => {
  try {
    rateLimit('showcase-change', clientAddress, 30);
    const body = await readJsonBody(request, 'Showcase change error:');
    const owner = textField(body, 'owner').trim();
    await assertWalletOwner({
      owner,
      nonce: textField(body, 'nonce'),
      signature: textField(body, 'signature'),
      publicKey: textField(body, 'publicKey').trim()
    });
    return json(setShowcase(owner, body['token'], body['visible'], publicBaseUrl(url)));
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo cambiar la portada.', 'Showcase change error:');
  }
};
