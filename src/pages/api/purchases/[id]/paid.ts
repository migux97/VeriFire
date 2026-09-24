import type { APIRoute } from 'astro';
import { publicBaseUrl } from '@/lib/server/config';
import { errorResponse, json, readJsonBody } from '@/lib/server/http';
import { confirmWalletPayment, findPurchase } from '@/lib/server/purchases';
import { rateLimit } from '@/lib/server/rate-limit';

// The company paid from its browser wallet: the transaction is handed to Cosmos Pay to confirm the purchase.
export const POST: APIRoute = async ({ params, request, url, clientAddress }) => {
  try {
    rateLimit('purchase-paid', clientAddress, 20);
    const purchase = params.id ? findPurchase(params.id) : undefined;
    if (!purchase) return json({ error: 'La compra no existe.' }, 404);
    const body = await readJsonBody(request, 'Wallet payment request error:');
    return json(await confirmWalletPayment(purchase, String(body['txHash'] ?? ''), publicBaseUrl(url)));
  } catch (error) {
    return errorResponse(error, 502, 'No se pudo confirmar el pago con Cosmos Pay.', 'Cosmos wallet payment error:');
  }
};
