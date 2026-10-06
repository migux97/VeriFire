// The batches of a company open only with the session cookie its wallet earns by signing (see WorkspaceSync and
// company-session.ts on the server). The panel loads its batches while that signature may still be on its way, and
// the cookie expires after a few hours, so a request answered 401 asks for a new signature and is tried once more.
import { ApiError } from './api';

export const COMPANY_SESSION_NEEDED_EVENT = 'verifire:company-session-needed';
// Long enough for the wallet to sign; past it the request is retried anyway and shows its own error.
const WAIT_MS = 20_000;

let waiting: (() => void)[] = [];

// Called by WorkspaceSync when a round of signing ends, whether it worked or not.
export const companySessionSettled = () => {
  const done = waiting;
  waiting = [];
  for (const resolve of done) resolve();
};

const awaitCompanySession = () =>
  new Promise<void>((resolve) => {
    waiting.push(resolve);
    window.setTimeout(resolve, WAIT_MS);
    window.dispatchEvent(new Event(COMPANY_SESSION_NEEDED_EVENT));
  });

export const withCompanySession = async <T>(request: () => Promise<T>): Promise<T> => {
  try {
    return await request();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || typeof window === 'undefined') throw error;
    await awaitCompanySession();
    return request();
  }
};
