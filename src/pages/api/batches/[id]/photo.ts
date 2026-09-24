import type { APIRoute } from 'astro';
import { errorResponse } from '@/lib/server/http';
import { photoBytes } from '@/lib/server/photos';
import { rateLimit } from '@/lib/server/rate-limit';
import { normalizeId } from '@/lib/validation';

// The photo of a batch, public like the QR of the batch: it is what its products look like.
export const GET: APIRoute = ({ params, clientAddress }) => {
  try {
    rateLimit('batch-photo', clientAddress, 300);
    const photo = photoBytes(normalizeId(params.id));
    if (!photo) return new Response('No hay foto para este lote.', { status: 404 });
    return new Response(new Uint8Array(photo.bytes), {
      headers: {
        'Content-Type': photo.mime,
        // The address changes with the photo (?v=), so it can be kept for long.
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo leer la foto.', 'Batch photo error:');
  }
};
