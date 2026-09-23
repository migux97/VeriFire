import type { APIRoute } from 'astro';
import { errorResponse, json, readJsonBody, textField } from '@/lib/server/http';
import { invitationByToken } from '@/lib/server/invitations';
import { rateLimit } from '@/lib/server/rate-limit';

// What an invitation link or QR offers, shown before accepting it. The token travels in the body, never in a URL.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    rateLimit('invitations-view', clientAddress, 60);
    return json({ invitation: invitationByToken(textField(await readJsonBody(request, 'Invitation view error:'), 'token')) });
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo abrir la invitación.', 'Invitation view error:');
  }
};
