import type { APIRoute } from 'astro';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';
import { createInvitation } from '@/lib/server/invitations';
import { rateLimit } from '@/lib/server/rate-limit';

// A company invites someone to its team: by email (sent with Resend), or with an open link or QR.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    rateLimit('invitations-create', clientAddress, 20);
    const body = await readJsonBody(request, 'Invitation create error:');
    // Emails cost reputation with the mail providers: an address sends fewer of them than it creates links.
    if (typeof body['email'] === 'string' && body['email'].trim()) rateLimit('invitations-email', clientAddress, 5);
    return json(await createInvitation(body), 201);
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo crear la invitación.', 'Invitation create error:');
  }
};
