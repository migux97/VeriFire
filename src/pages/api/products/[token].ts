import type { APIRoute } from 'astro';
import { json } from '@/lib/server/http';
import { findProduct, publicProductView } from '@/lib/server/products';

export const GET: APIRoute = ({ params }) => {
  const product = findProduct(params.token);
  if (!product) return json({ error: 'El token de producto no existe.' }, 404);
  return json(publicProductView(product));
};
