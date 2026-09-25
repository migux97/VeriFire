import type { APIRoute } from 'astro';
import { HttpError } from '@/lib/server/errors';
import { errorResponse, json, readJsonBody, textField } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';
import { assertAdmin, companiesForReview, decideVerification, isAdminWallet, requestVerification } from '@/lib/server/verification-actions';
import { assertWalletOwner } from '@/lib/server/wallet-auth';

// Everything about verifying companies, all of it signed with a wallet like any change to an account:
//  - request:          a company asks to be verified (its own wallet);
//  - whoami:           whether this wallet administers Verifire (to show or hide the review panel);
//  - list:             the companies with what they declared and what they did (administrators only);
//  - approve | reject: the decision (administrators only).
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    rateLimit('verification', clientAddress, 40);
    const body = await readJsonBody(request, 'Verification error:');
    const owner = textField(body, 'owner').trim();
    await assertWalletOwner({
      owner,
      nonce: textField(body, 'nonce'),
      signature: textField(body, 'signature'),
      publicKey: textField(body, 'publicKey').trim()
    });
    switch (textField(body, 'action')) {
      case 'request':
        return json({ verification: requestVerification(owner, body['message']) });
      case 'whoami':
        return json({ admin: isAdminWallet(owner) });
      case 'list':
        assertAdmin(owner);
        return json({ companies: companiesForReview() });
      case 'approve':
        return json({ verification: decideVerification(owner, body['target'], 'approve', { name: body['name'], domain: body['domain'] }) });
      case 'reject':
        return json({ verification: decideVerification(owner, body['target'], 'reject', { note: body['note'] }) });
      default:
        throw new HttpError(400, 'Acción no válida.');
    }
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo completar la verificación.', 'Verification error:');
  }
};
