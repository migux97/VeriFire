import type { APIRoute } from 'astro';
import { errorResponse, json, readJsonBody, textField } from '@/lib/server/http';
import { inbox } from '@/lib/server/invitations';
import { rateLimit } from '@/lib/server/rate-limit';

// The invitations waiting for the account signed in on a browser. POST so the email stays out of the access logs.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    rateLimit('invitations-inbox', clientAddress, 60);
    return json({ invitations: inbox(textField(await readJsonBody(request, 'Invitation inbox error:'), 'email')) });
  } catch (error) {
    return errorResponse(error, 500, 'No se pudieron consultar las invitaciones.', 'Invitation inbox error:');
  }
};
