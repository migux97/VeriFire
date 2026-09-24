import type { APIRoute } from 'astro';
import { isRegistered } from '@/lib/server/accounts';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';

// Asked by the registration before sending the email code: whether that email already has an account. The budget per
// address keeps anyone from walking through a list of emails to find who uses Verifire.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    rateLimit('accounts-exists', clientAddress, 15);
    const body = await readJsonBody(request, 'Account check error:');
    return json({ registered: isRegistered(body['email']) });
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo comprobar el correo.', 'Account check error:');
  }
};
