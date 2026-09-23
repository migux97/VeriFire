// A budget of requests per address for the endpoints anyone can call. It keeps one script from filling the store, the
// product histories or the payment provider with requests; it is not a defence against a distributed flood, and it
// lives in memory, so it resets with the process.
import { HttpError } from './errors';
import { messages } from './messages';
import { singleton } from './singleton';

const WINDOW_MS = 60 * 1000;
// Addresses tracked at once. Past this, the oldest windows are dropped: a flood from many addresses cannot grow the map.
const MAX_TRACKED = 5000;

const windows = singleton('rate-limit', () => new Map<string, { count: number; until: number }>());

// Like rateLimit, for work that is optional: answers false instead of throwing once the budget is spent.
export const withinBudget = (bucket: string, caller: string | undefined, limit: number) => {
  try {
    rateLimit(bucket, caller, limit);
    return true;
  } catch {
    return false;
  }
};

// `caller` is the client address, or the empty string when the adapter cannot tell (then the limit is shared).
export const rateLimit = (bucket: string, caller: string | undefined, limit: number) => {
  const now = Date.now();
  if (windows.size > MAX_TRACKED) {
    for (const [key, window] of windows) if (window.until <= now) windows.delete(key);
    if (windows.size > MAX_TRACKED) windows.clear();
  }
  const key = `${bucket}:${caller ?? ''}`;
  const current = windows.get(key);
  if (!current || current.until <= now) {
    windows.set(key, { count: 1, until: now + WINDOW_MS });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    throw new HttpError(429, messages.tooManyRequests, { retryable: true });
  }
};
