// What a company account is, kept next to its wallet instead of only in one browser: which purchases are its own and
// what kind of account it is. The buyer's warranties already follow the wallet (the contract holds the owner); this
// does the same for the company side, so signing in from another browser finds the same batches and the same panel.
//
// Reading or writing it needs a signature from that wallet (see wallet-auth.ts): a purchase id is the key to the
// secret codes of its batch, so this list is never handed out to whoever asks.
import { HttpError } from './errors';
import { saveState, store, type Workspace } from './store';

const MAX_PURCHASES = 500;

export const findWorkspace = (owner: string): Workspace | undefined => store.workspaces.get(owner);

export const workspaceView = (owner: string) => {
  const workspace = findWorkspace(owner);
  return {
    owner,
    purchaseIds: workspace?.purchaseIds ?? [],
    accountType: workspace?.accountType ?? null,
    companyName: workspace?.companyName ?? null
  };
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
}) => {
  const current = findWorkspace(owner);
  const incoming = Array.isArray(changes.purchaseIds) ? changes.purchaseIds.filter((id): id is string => typeof id === 'string') : [];
  const removed = new Set(Array.isArray(changes.removedPurchaseIds)
    ? changes.removedPurchaseIds.filter((id): id is string => typeof id === 'string')
    : []);
  if (incoming.length > MAX_PURCHASES) throw new HttpError(400, 'Demasiadas compras en una sola sincronización.');

  const purchaseIds = [...new Set([...incoming, ...(current?.purchaseIds ?? [])])]
    .filter((purchaseId) => !removed.has(purchaseId) && store.purchases.has(purchaseId))
    .slice(0, MAX_PURCHASES);

  const accountType = changes.accountType === 'business' || changes.accountType === 'personal'
    ? changes.accountType
    : current?.accountType;
  const companyName = changes.companyName === undefined ? current?.companyName : text(changes.companyName, 80);

  store.workspaces.set(owner, {
    owner,
    purchaseIds,
    ...(accountType ? { accountType } : {}),
    ...(companyName ? { companyName } : {}),
    updatedAt: new Date().toISOString()
  });
  saveState();
  return workspaceView(owner);
};
