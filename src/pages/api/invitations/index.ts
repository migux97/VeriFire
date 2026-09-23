import type { APIRoute } from 'astro';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';
import { createInvitation } from '@/lib/server/invitations';
import { rateLimit } from '@/lib/server/rate-limit';

// A company invites someone to its team: by email, or with an open link and its QR.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    rateLimit('invitations-create', clientAddress, 20);
    return json(createInvitation(await readJsonBody(request, 'Invitation create error:')), 201);
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo crear la invitación.', 'Invitation create error:');
  }
};
