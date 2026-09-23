// The Verifire account lives in this browser (there are no server-side user accounts).
import { readStored, writeStored } from './storage';

export interface PasswordHash {
  salt: string;
  hash: string;
  iterations: number;
}

export interface StoredUser {
  name: string;
  email: string;
  accountType?: 'personal' | 'business';
  companyName?: string;
  passwordHash?: PasswordHash | undefined;
  // Accounts created before hashing kept the password in plain text.
  password?: string;
  provider?: 'google';
  // Saved when the email is verified, so logins in the next 7 days only need the password.
  walletAddress?: string;
  cavosUserId?: string;
  emailVerifiedAt?: number;
  // When the multi-device factor was saved in the Cavos account; 0 while it is missing.
  deviceFactorAt?: number;
}

const USER_KEY = 'verifireUser';

export const storedUser = () => readStored<StoredUser>(localStorage, USER_KEY);

export const persistUser = (user: StoredUser) => writeStored(localStorage, USER_KEY, user);

export const updateStoredUser = (changes: Partial<StoredUser>) => {
  const user = storedUser();
  if (user) persistUser({ ...user, ...changes });
};
