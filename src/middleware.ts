import { defineMiddleware, sequence } from 'astro:middleware';
import { CORS_ORIGIN } from 'astro:env/server';

// Printed QR labels and the Cavos Google callback still point at the old .html pages. The `redirects` option of the
// Astro config would drop the query string, which carries the product token, so they are redirected here.
const LEGACY_PATHS: Record<string, string> = {
  '/index.html': '/acceso',
  '/app.html': '/app',
  '/lotes.html': '/lotes',
  '/admin.html': '/admin',
  '/batch.html': '/batch',
  '/verify.html': '/verify',
  // Browsers ask for /favicon.ico on their own, even with a <link rel="icon">.
  '/favicon.ico': '/favicon.svg'
};

const legacyPaths = defineMiddleware((context, next) => {
  const target = LEGACY_PATHS[context.url.pathname];
  return target ? context.redirect(`${target}${context.url.search}`, 301) : next();
});

// Only when CORS_ORIGIN is set: the frontend served by this same server needs no CORS.
const cors = defineMiddleware(async (context, next) => {
  if (!context.url.pathname.startsWith('/api/')) return next();
  const allowOrigin: Record<string, string> = CORS_ORIGIN ? { 'Access-Control-Allow-Origin': CORS_ORIGIN } : {};
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...allowOrigin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
    });
  }
  const response = await next();
  if (CORS_ORIGIN) response.headers.set('Access-Control-Allow-Origin', CORS_ORIGIN);
  return response;
});

export const onRequest = sequence(legacyPaths, cors);
