// The language of a page that has a single route: the one chosen on the landing (kept in a cookie by the locale
// middleware), or the one the route itself carries. See src/lib/locale.ts.
import type { AstroGlobal } from 'astro';
import { DEFAULT_LOCALE, LOCALE_COOKIE, toLocale, type Locale } from '../locale';

export const pageLocale = (astro: Pick<AstroGlobal, 'cookies' | 'currentLocale'>): Locale =>
  toLocale(astro.cookies.get(LOCALE_COOKIE)?.value) ?? toLocale(astro.currentLocale) ?? DEFAULT_LOCALE;
