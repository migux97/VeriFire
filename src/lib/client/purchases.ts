// A purchase id is the key to the secret codes of its batch and there are no server-side company accounts, so the
// list of purchases is kept in this browser, per account. Shared by the buy page and the list of batches.
import type { PurchaseStatus } from '../types';
import { getJson, postJson } from './api';
import { userSession } from './session';
import { readStored, writeStored } from './storage';

const LEGACY_PURCHASE_KEY = 'verifireLastPurchase';
const purchasesKey = () => `verifireCompanyPurchases:${userSession.email().toLowerCase()}`;

export const savedPurchaseIds = (): string[] => {
  const list = readStored<unknown>(localStorage, purchasesKey());
  if (!Array.isArray(list)) return [];
  return list
    .map((item: unknown) => (typeof item === 'object' && item !== null ? (item as { purchaseId?: unknown }).purchaseId : undefined))
    .filter((id): id is string => typeof id === 'string');
};

const writePurchaseIds = (ids: string[]) => {
  try {
    writeStored(localStorage, purchasesKey(), ids.map((purchaseId) => ({ purchaseId })));
  } catch {
    // Without storage the list only lasts while the page is open.
  }
};

export const savePurchase = (purchaseId: string) => writePurchaseIds([purchaseId, ...savedPurchaseIds().filter((id) => id !== purchaseId)]);
export const forgetPurchase = (purchaseId: string) => writePurchaseIds(savedPurchaseIds().filter((id) => id !== purchaseId));

// The panel used to keep only the last purchase under its own key; it moves into the list once.
export const migrateLegacyPurchase = () => {
  const legacy = readStored<{ purchaseId?: unknown }>(localStorage, LEGACY_PURCHASE_KEY);
  if (typeof legacy?.purchaseId === 'string' && !savedPurchaseIds().includes(legacy.purchaseId)) savePurchase(legacy.purchaseId);
  try {
    localStorage.removeItem(LEGACY_PURCHASE_KEY);
  } catch {
    // A legacy entry that cannot be removed is ignored next time too.
  }
};

// The summary of a purchase: enough to list and count batches, with no secret code and no QR image.
export const fetchPurchase = (purchaseId: string) =>
  getJson<PurchaseStatus>(`/api/purchases/${encodeURIComponent(purchaseId)}`, 'No se pudo consultar la compra.');

// The batch with the secret code and the QR images of every product. Asked for with the id in the body, never in the
// URL: the id is the only key to those codes and it cannot be rotated.
export const fetchPurchaseDetail = (purchaseId: string) =>
  postJson<PurchaseStatus>('/api/purchases/detail', { purchaseId }, 'No se pudo consultar la compra.');
