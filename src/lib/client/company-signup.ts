// Everybody registers as a person; a company is created afterwards, by the person who runs it. Whoever arrives wanting
// to register a company ("Registrar mi empresa" on the landing) is remembered through the login, the email code and the
// Google redirect, and lands on the page that creates it right after the account exists.
import { storedUser, updateStoredUser, type StoredUser } from './account';
import { readCompanyProfile, saveCompanyProfile } from './company-profile';
import { readRaw, removeStored, writeRaw } from './storage';

const INTENT_KEY = 'verifireCompanyIntent';

export const CREATE_COMPANY_PATH = '/create-company';

export const rememberCompanyIntent = () => writeRaw(sessionStorage, INTENT_KEY, '1');
export const hasCompanyIntent = () => readRaw(sessionStorage, INTENT_KEY) === '1';
export const forgetCompanyIntent = () => removeStored(sessionStorage, INTENT_KEY);

// The account runs a company of its own (as opposed to only being part of someone else's team).
export const hasOwnCompany = (user: StoredUser | null) => user?.accountType === 'business';

// Makes the account the owner of a company. What the server keeps follows with the next sync of the panel (see
// WorkspaceSync), signed with the account's wallet as any other change to it.
export const createOwnCompany = (name: string, industry: string) => {
  const user = storedUser();
  if (!user) return false;
  updateStoredUser({ accountType: 'business', companyName: name });
  if (industry && !saveCompanyProfile({ ...readCompanyProfile(), industry }, name)) return false;
  forgetCompanyIntent();
  return true;
};
