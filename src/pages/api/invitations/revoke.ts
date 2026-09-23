import type { APIRoute } from 'astro';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';
import { revoke } from '@/lib/server/invitations';
import { rateLimit } from '@/lib/server/rate-limit';

// The company cancels an invitation it sent (it holds the token).
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    rateLimit('invitations-revoke', clientAddress, 30);
    return json({ invitation: revoke(await readJsonBody(request, 'Invitation revoke error:')) });
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo cancelar la invitación.', 'Invitation revoke error:');
  }
};
