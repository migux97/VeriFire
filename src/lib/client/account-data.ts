// What a company keeps configured: its team, its agenda, its label templates, its profile. It belongs to the account,
// not to the browser it was typed in, so it travels with the wallet (see workspace-sync.ts) and turns up wherever the
// account signs in.
//
// Adding a new kind of data to that list is all a new feature needs: write it through here and it follows the account.
// What must NOT be listed: secrets of this browser (the secret of an open transfer link) and notes about this device
// (which purchase it already announced), which mean nothing anywhere else.
import { accountKey } from './session';
import { readStored, writeStored } from './storage';

export const ACCOUNT_DATA = [
  'company-team',
  'company-schedules',
  'company-profile',
  'company-role-permissions',
  'brand-public',
  'warranty-settings',
  'issuance-templates',
  'issuance-products',
  'notification-prefs'
] as const;

export type AccountDataName = (typeof ACCOUNT_DATA)[number];

// When each kind was last written here, so the newest copy wins over the one another browser has.
const TIMES = 'account-data-times';

const readTimes = () => readStored<Record<string, string>>(localStorage, accountKey(TIMES)) ?? {};

// Tells the panels on this page to read again what just arrived from the account.
export const ACCOUNT_DATA_EVENT = 'verifire:account-data-changed';
// Something was saved here: the account sync sends it to the other browsers of the account.
export const ACCOUNT_DATA_WRITTEN_EVENT = 'verifire:account-data-written';

export const readAccountData = <T>(name: AccountDataName, legacyKey?: string): T | null =>
  readStored<T>(localStorage, accountKey(name, legacyKey));

// False when the browser refused to store it (a full quota, most often a logo).
export const writeAccountData = (name: AccountDataName, value: unknown, { at }: { at?: string } = {}) => {
  if (!writeStored(localStorage, accountKey(name), value)) return false;
  writeStored(localStorage, accountKey(TIMES), { ...readTimes(), [name]: at ?? new Date().toISOString() });
  if (!at) window.dispatchEvent(new Event(ACCOUNT_DATA_WRITTEN_EVENT));
  return true;
};

export interface AccountDataEntry {
  value: unknown;
  updatedAt: string;
}

// Everything this browser has for the account, with the moment each one was written.
export const accountDataSnapshot = (): Record<string, AccountDataEntry> => {
  const times = readTimes();
  const snapshot: Record<string, AccountDataEntry> = {};
  for (const name of ACCOUNT_DATA) {
    const value = readAccountData<unknown>(name);
    if (value !== null) snapshot[name] = { value, updatedAt: times[name] ?? new Date(0).toISOString() };
  }
  return snapshot;
};

// What came from the account: a kind is taken only when its copy is newer than the one here.
export const applyAccountData = (remote: Record<string, AccountDataEntry> | undefined) => {
  if (!remote) return false;
  const times = readTimes();
  let changed = false;
  for (const name of ACCOUNT_DATA) {
    const entry = remote[name];
    if (!entry || entry.value === undefined) continue;
    const mine = times[name];
    if (mine && mine >= entry.updatedAt) continue;
    if (writeAccountData(name, entry.value, { at: entry.updatedAt })) changed = true;
  }
  if (changed) window.dispatchEvent(new Event(ACCOUNT_DATA_EVENT));
  return changed;
};
