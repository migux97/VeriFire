// The company's warranty settings for its products: the support email the buyer sees and how long a warranty lasts.
// Kept with the account's data (see account-data.ts) and sent to the server, which gives them to every batch of the
// company and shows the email to the owners of its products.
import { postJson } from './api';
import { storedUser } from './account';
import { realPurchaseIds } from './purchases';
import { readAccountData, writeAccountData } from './account-data';
import { userSession } from './session';

export const WARRANTY_MONTH_OPTIONS = [6, 12, 18, 24, 36] as const;
export type WarrantyMonths = (typeof WARRANTY_MONTH_OPTIONS)[number];

export interface WarrantySettings {
  email: string;
  warrantyMonths: WarrantyMonths;
}

// Where they were kept before they traveled with the account.
const legacyKey = () => `verifire:warranty-settings:${userSession.email().toLowerCase()}`;

export const readWarrantySettings = (): WarrantySettings | null => {
  const saved = readAccountData<Partial<WarrantySettings>>('warranty-settings', legacyKey());
  if (!saved?.email) return null;
  const months = WARRANTY_MONTH_OPTIONS.find((option) => option === saved.warrantyMonths) ?? 12;
  return { email: saved.email, warrantyMonths: months };
};

// What a new purchase carries, so its batch shows the support email from the start.
export const supportForNewBatch = () => {
  const settings = readWarrantySettings();
  const companyName = storedUser()?.companyName?.trim() ?? '';
  return settings && companyName ? { companyName, email: settings.email, warrantyMonths: settings.warrantyMonths } : undefined;
};

// Saves the settings and applies them to every batch this company already has. Answers how many were updated.
export const saveWarrantySettings = async (settings: WarrantySettings) => {
  const companyName = storedUser()?.companyName?.trim() ?? '';
  const ids = realPurchaseIds();
  let updated = 0;
  if (ids.length) {
    ({ updated } = await postJson<{ updated: number }>(
      '/api/purchases/support',
      { purchaseIds: ids, support: { companyName, ...settings } },
      'No se pudo guardar la configuración de garantías.'
    ));
  } else if (!companyName) {
    throw new Error('Completá el nombre de la empresa en el perfil antes de configurar las garantías.');
  }
  writeAccountData('warranty-settings', settings);
  return updated;
};
