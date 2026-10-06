import type { APIRoute } from 'astro';
import { assertPurchaseOwner } from '@/lib/server/company-session';
import { endorsementView, prepareEndorsement, submitEndorsement } from '@/lib/server/endorsements';
import { errorResponse, json, readJsonBody, textField } from '@/lib/server/http';
import { findPurchase } from '@/lib/server/purchases';
import { rateLimit } from '@/lib/server/rate-limit';
import { store } from '@/lib/server/store';

// The company signs its batch on Stellar (see endorsements.ts), only from the wallet that owns the purchase. With
// `prepare` it answers the transaction for that wallet; with `signedXdr`, submits it; with neither, where it stands.
export const POST: APIRoute = async ({ request, clientAddress, cookies }) => {
  try {
    // Each call may read or submit to Stellar, so an address gets a budget of them.
    rateLimit('purchase-endorse', clientAddress, 60);
    const body = await readJsonBody(request, 'Batch endorsement error:');
    const purchase = findPurchase(textField(body, 'purchaseId'));
    if (!purchase) return json({ error: 'La compra no existe.' }, 404);
    assertPurchaseOwner(cookies, purchase);
    const issuer = purchase.owner as string;
    const batch = purchase.batchId ? store.batches.get(purchase.batchId) : undefined;
    const signedXdr = textField(body, 'signedXdr');
    if (signedXdr) return json({ endorsement: await submitEndorsement(batch, issuer, signedXdr) });
    if (body['prepare'] === true) return json({ xdr: await prepareEndorsement(batch, issuer) });
    return json({ endorsement: await endorsementView(batch) });
  } catch (error) {
    return errorResponse(error, 502, 'No se pudo firmar el lote en Stellar.', 'Batch endorsement error:');
  }
};
