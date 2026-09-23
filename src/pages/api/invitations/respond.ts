import type { APIRoute } from 'astro';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';
import { respond } from '@/lib/server/invitations';
import { rateLimit } from '@/lib/server/rate-limit';

// The invitee accepts or declines.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    rateLimit('invitations-respond', clientAddress, 30);
    return json({ invitation: respond(await readJsonBody(request, 'Invitation respond error:')) });
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo responder la invitación.', 'Invitation respond error:');
  }
};
