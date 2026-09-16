// A purchase id is the key to the secret codes of its batch and there are no server-side company accounts, so the
// list of purchases is kept in this browser, per account. Shared by the buy page and the list of batches.
import type { PurchaseStatus } from '../types';
import { getJson } from './api';
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

// With { summary: true } the answer carries no secret codes and no QR images: enough to list and count batches.
export const fetchPurchase = (purchaseId: string, { summary = false } = {}) =>
  getJson<PurchaseStatus>(`/api/purchases/${encodeURIComponent(purchaseId)}${summary ? '?summary=1' : ''}`, 'No se pudo consultar la compra.');
