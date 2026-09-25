// Which Cavos login signs for the account that is signed in to Verifire. Cavos keeps its own login in the browser (it
// outlives logging out of Verifire, and a password-only login does not refresh it), so it can belong to another account:
// the one whose password was recovered here a while ago, for instance. That one must never sign for this account.
export interface CavosLogin {
  userId: string;
  email?: string;
}

export interface SignedInAccount {
  email?: string | undefined;
  // The Cavos user id saved when the account's email was verified.
  cavosUserId?: string | undefined;
}

export const chooseIdentity = <T extends CavosLogin>(
  restored: T | null,
  account: SignedInAccount | null,
  sessionEmail: string
): { identity: CavosLogin | T | null; foreign: boolean } => {
  // Only what says it is another email counts as foreign: a login without an email is taken as this account's, as before.
  const foreign = Boolean(restored?.email && account?.email && restored.email.toLowerCase() !== account.email.toLowerCase());
  if (restored && !foreign) return { identity: restored, foreign: false };
  // The account's own login, from the user id saved when it verified its email: enough to reopen the same wallet.
  const own = Boolean(account?.email) && account?.email === sessionEmail;
  if (own && account?.cavosUserId) return { identity: { userId: account.cavosUserId, ...(account.email ? { email: account.email } : {}) }, foreign };
  return { identity: null, foreign };
};
