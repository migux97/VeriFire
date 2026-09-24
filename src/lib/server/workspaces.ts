// What a company account is, kept next to its wallet instead of only in one browser: which purchases are its own and
// what kind of account it is. The buyer's warranties already follow the wallet (the contract holds the owner); this
// does the same for the company side, so signing in from another browser finds the same batches and the same panel.
//
// Reading or writing it needs a signature from that wallet (see wallet-auth.ts): a purchase id is the key to the
// secret codes of its batch, so this list is never handed out to whoever asks.
import { buildBrand } from './brands';
import { HttpError } from './errors';
import { withoutSampleEntries } from '../sample-data';
import { saveState, store, type Workspace } from './store';

const MAX_PURCHASES = 500;
// A team, an agenda and a logo fit well inside this; the body of a request is capped at 64 KiB anyway.
const MAX_DATA_BYTES = 48 * 1024;
const MAX_DATA_KINDS = 40;

// Drops the demo's invented entries that reached the account (see sample-data.ts). The date stays: removing them is not
// an edit, so a newer copy from a browser still replaces it (browsers drop them too, see account-data.ts).
const withoutSamples = (data: Workspace['data']): Workspace['data'] => {
  if (!data) return data;
  let cleaned: NonNullable<Workspace['data']> | null = null;
  for (const [name, entry] of Object.entries(data)) {
    const value = withoutSampleEntries(entry.value);
    if (!value) continue;
    cleaned ??= { ...data };
    cleaned[name] = { value, updatedAt: entry.updatedAt };
  }
  return cleaned ?? data;
};

export const findWorkspace = (owner: string): Workspace | undefined => {
  const workspace = store.workspaces.get(owner);
  const data = withoutSamples(workspace?.data);
  if (workspace && data && data !== workspace.data) {
    workspace.data = data;
    try {
      saveState();
    } catch {
      // Cleaned again the next time it is read.
    }
  }
  return workspace;
};

// Newest first, the way the panel lists them.
const purchasesOf = (owner: string) => [...store.purchases.values()]
  .filter((purchase) => purchase.owner === owner)
  .sort((first, second) => String(second.createdAt ?? '').localeCompare(String(first.createdAt ?? '')))
  .map((purchase) => purchase.purchaseId);

export const workspaceView = (owner: string) => {
  const workspace = findWorkspace(owner);
  const purchaseIds = purchasesOf(owner);
  return {
    owner,
    purchaseIds,
    // A wallet that bought a batch is a company: its panel is offered on every device it signs in from.
    accountType: workspace?.accountType ?? (purchaseIds.length ? ('business' as const) : null),
    companyName: workspace?.companyName ?? null,
    data: workspace?.data ?? {},
    // Only what is needed to build the address of the logo; the brand itself is read by whoever shows it.
    brand: workspace?.brand ? { slug: workspace.brand.slug, hasLogo: Boolean(workspace.brand.logo) } : null
  };
};

// Each kind of configured data is kept with the moment the browser wrote it, and only a newer copy replaces it.
const mergeData = (current: Workspace['data'], incoming: unknown): Workspace['data'] => {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return current;
  const merged: NonNullable<Workspace['data']> = { ...(current ?? {}) };
  for (const [name, entry] of Object.entries(incoming as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const { value, updatedAt } = entry as { value?: unknown; updatedAt?: unknown };
    if (value === undefined || typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt))) continue;
    const mine = merged[name];
    if (mine && mine.updatedAt >= updatedAt) continue;
    merged[name] = { value, updatedAt };
  }
  const clean = withoutSamples(merged) ?? merged;
  if (Object.keys(clean).length > MAX_DATA_KINDS) throw new HttpError(400, 'Demasiada configuración para una sola cuenta.');
  if (JSON.stringify(clean).length > MAX_DATA_BYTES) {
    throw new HttpError(413, 'La configuración de la empresa es demasiado grande. Probá con un logo más liviano.');
  }
  return clean;
};

const text = (value: unknown, limit: number) => {
  const trimmed = String(value ?? '').trim();
  if (trimmed.length > limit) throw new HttpError(400, 'El nombre de la empresa es demasiado largo.');
  return trimmed;
};

// The browser sends what it has; the answer is what the account holds afterwards. Purchase ids are merged, never
// dropped, so a browser that only knows some of them cannot erase the rest.
export const mergeWorkspace = (owner: string, changes: {
  purchaseIds?: unknown;
  removedPurchaseIds?: unknown;
  accountType?: unknown;
  companyName?: unknown;
  data?: unknown;
  // The public brand: an object to publish or replace it, null to take it down, absent to leave it as it is.
  brand?: unknown;
}) => {
  const current = findWorkspace(owner);
  const incoming = Array.isArray(changes.purchaseIds) ? changes.purchaseIds.filter((id): id is string => typeof id === 'string') : [];
  const removed = new Set(Array.isArray(changes.removedPurchaseIds)
    ? changes.removedPurchaseIds.filter((id): id is string => typeof id === 'string')
    : []);
  if (incoming.length > MAX_PURCHASES) throw new HttpError(400, 'Demasiadas compras en una sola sincronización.');
  // Checked before anything changes: a rejected sync (too much data, a brand that is not valid) must leave the purchases
  // as they were.
  const data = mergeData(current?.data, changes.data);
  const brand = changes.brand === undefined ? current?.brand : changes.brand === null ? undefined : buildBrand(owner, changes.brand, current?.brand);

  // A purchase made before the panel sent its wallet is claimed by the browser that still holds its id, and only
  // while nobody else holds it: from then on it belongs to that account and no browser has to remember it.
  for (const purchaseId of incoming.slice(0, MAX_PURCHASES)) {
    const purchase = store.purchases.get(purchaseId);
    if (purchase && !purchase.owner && !removed.has(purchaseId)) purchase.owner = owner;
  }
  for (const purchaseId of removed) {
    const purchase = store.purchases.get(purchaseId);
    if (purchase?.owner === owner) delete purchase.owner;
  }

  const accountType = changes.accountType === 'business' || changes.accountType === 'personal'
    ? changes.accountType
    : current?.accountType;
  const companyName = changes.companyName === undefined ? current?.companyName : text(changes.companyName, 80);
  const purchaseIds = workspaceView(owner).purchaseIds;

  store.workspaces.set(owner, {
    owner,
    purchaseIds,
    ...(accountType ? { accountType } : {}),
    ...(companyName ? { companyName } : {}),
    ...(data && Object.keys(data).length ? { data } : {}),
    ...(brand ? { brand } : {}),
    updatedAt: new Date().toISOString()
  });
  saveState();
  return workspaceView(owner);
};
