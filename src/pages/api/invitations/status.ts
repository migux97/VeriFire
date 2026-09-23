import type { APIRoute } from 'astro';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';
import { statuses } from '@/lib/server/invitations';
import { rateLimit } from '@/lib/server/rate-limit';

// The state of the invitations a company sent, for its team list.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    rateLimit('invitations-status', clientAddress, 60);
    return json({ invitations: statuses(await readJsonBody(request, 'Invitation status error:')) });
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo consultar el estado de las invitaciones.', 'Invitation status error:');
  }
};
