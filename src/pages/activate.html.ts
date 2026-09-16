import type { APIRoute } from 'astro';
import { qrKeyFor } from '@/lib/server/links';
import { normalizeId } from '@/lib/validation';

// Labels printed before the panel scanner pointed to activate.html?token=...&secret=...
export const GET: APIRoute = ({ url, redirect }) => {
  const secret = url.searchParams.get('secret');
  return redirect(secret ? `/app#q=${qrKeyFor(normalizeId(secret))}` : '/app', 302);
};
