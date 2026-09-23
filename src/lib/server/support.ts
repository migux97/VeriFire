// Warranty settings of a company's products: who the buyer contacts for support, and how long a warranty lasts. The
// company sets them in its panel (Configuración → Garantías de productos) and they travel with each of its batches.
// There are no server-side company accounts, so a batch's settings can be changed by whoever holds its purchase id,
// the same key that already opens its secret codes.
import { HttpError } from './errors';
import type { JsonBody } from './http';
import { saveState, store, type Product, type SupportSettings } from './store';

export const WARRANTY_MONTH_OPTIONS = [6, 12, 18, 24, 36];
export const DEFAULT_WARRANTY_MONTHS = 12;
// More than any company keeps in its panel; past it the request is refused rather than half applied.
const MAX_PURCHASES = 2000;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

// Undefined when nothing was sent; an error when what was sent is not valid.
export const parseSupport = (value: unknown): SupportSettings | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Configuración de garantía inválida.');
  const input = value as Record<string, unknown>;
  const companyName = typeof input['companyName'] === 'string' ? input['companyName'].trim() : '';
  const email = typeof input['email'] === 'string' ? input['email'].trim().toLowerCase() : '';
  const warrantyMonths = Number(input['warrantyMonths']);
  if (!companyName || companyName.length > 100) throw new HttpError(400, 'Completá el nombre de la empresa en Configuración.');
  if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, 'Ingresá un correo de soporte válido.');
  if (!WARRANTY_MONTH_OPTIONS.includes(warrantyMonths)) throw new HttpError(400, 'Elegí una duración de garantía válida.');
  return { companyName, email, warrantyMonths };
};

export const supportOf = (product: Product) => (product.batchId ? store.batches.get(product.batchId)?.support : undefined);

// The duration a warranty gets is the one set when it is activated: changing it later does not shorten or stretch the
// warranties already running.
export const monthsAtActivation = (product: Product) => supportOf(product)?.warrantyMonths ?? DEFAULT_WARRANTY_MONTHS;

// Applies the company's settings to its purchases (and their batches, once issued).
export const updateSupport = (body: JsonBody) => {
  const support = parseSupport(body['support']);
  if (!support) throw new HttpError(400, 'Falta la configuración de garantía.');
  // Each id once: a repeated one would record the new settings as its "previous" ones and break the rollback.
  const ids = Array.isArray(body['purchaseIds']) ? [...new Set(body['purchaseIds'].filter((id): id is string => typeof id === 'string'))] : [];
  if (ids.length > MAX_PURCHASES) throw new HttpError(400, 'Hay demasiadas compras para actualizar de una vez.');
  const previous = new Map<string, SupportSettings | undefined>();
  let updated = 0;
  for (const id of ids) {
    const purchase = store.purchases.get(id);
    if (!purchase) continue;
    previous.set(id, purchase.support);
    purchase.support = support;
    const batch = purchase.batchId ? store.batches.get(purchase.batchId) : undefined;
    if (batch) batch.support = support;
    updated += 1;
  }
  if (!updated) return { updated };
  try {
    saveState();
  } catch (error) {
    // Back to what the file still has, so memory and disk agree.
    for (const [id, before] of previous) {
      const purchase = store.purchases.get(id);
      if (!purchase) continue;
      const batch = purchase.batchId ? store.batches.get(purchase.batchId) : undefined;
      if (before) purchase.support = before;
      else delete purchase.support;
      if (batch) {
        if (before) batch.support = before;
        else delete batch.support;
      }
    }
    throw error;
  }
  return { updated };
};
