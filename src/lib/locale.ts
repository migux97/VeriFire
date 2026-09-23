// The language a visitor is reading in. The landing has a route per language (/ and /en/), but the pages behind the
// login have one route each, so the choice travels in a cookie: whoever reads the English landing keeps English in
// their panel, and switching back on the landing switches it back.
export type Locale = 'es' | 'en';

export const LOCALE_COOKIE = 'verifireLang';
export const DEFAULT_LOCALE: Locale = 'es';

export const isLocale = (value: unknown): value is Locale => value === 'es' || value === 'en';

// Astro reports 'en-US' and the like for a request's preferred locale.
export const toLocale = (value: unknown): Locale | null => {
  const tag = String(value ?? '').toLowerCase().split('-')[0];
  return isLocale(tag) ? tag : null;
};
