import type { APIRoute } from 'astro';
import { publicBaseUrl } from '@/lib/server/config';
import { errorResponse, json, readJsonBody, textField } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';
import { assertWalletOwner } from '@/lib/server/wallet-auth';
import { mergeWorkspace, workspaceView } from '@/lib/server/workspaces';

// Step two: with the signed nonce, the account's batches and its kind are read, and whatever the browser knows is
// merged into them. A purchase id opens the secret codes of its batch, so nothing here answers without that proof.
export const POST: APIRoute = async ({ request, clientAddress, url }) => {
  try {
    rateLimit('workspace', clientAddress, 60);
    const body = await readJsonBody(request, 'Workspace error:');
    const owner = textField(body, 'owner').trim();
    await assertWalletOwner({
      owner,
      nonce: textField(body, 'nonce'),
      signature: textField(body, 'signature'),
      publicKey: textField(body, 'publicKey').trim()
    });
    const hasChanges = ['purchaseIds', 'removedPurchaseIds', 'accountType', 'companyName', 'data', 'brand'].some((key) => body[key] !== undefined);
    const view = hasChanges ? mergeWorkspace(owner, body) : workspaceView(owner);
    // The logo has an address that does not change, on the domain this app is served from.
    const brand = view.brand
      ? { slug: view.brand.slug, logoUrl: view.brand.hasLogo ? `${publicBaseUrl(url)}/api/brand/${encodeURIComponent(view.brand.slug)}/logo.png` : null }
      : null;
    return json({ ...view, brand });
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo sincronizar tu cuenta de empresa.', 'Workspace error:');
  }
};
