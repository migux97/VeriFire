import type { APIRoute } from 'astro';
import { errorResponse, json } from '@/lib/server/http';
import { findProduct, publicProductView } from '@/lib/server/products';
import { rateLimit } from '@/lib/server/rate-limit';

export const GET: APIRoute = ({ params, clientAddress }) => {
  try {
    rateLimit('product-view', clientAddress, 120);
    const product = findProduct(params.token);
    if (!product) return json({ error: 'El token de producto no existe.' }, 404);
    return json(publicProductView(product));
  } catch (error) {
    return errorResponse(error, 500, 'No se pudo consultar el producto.', 'Product view error:');
  }
};
