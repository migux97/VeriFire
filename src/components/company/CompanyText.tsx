// The texts of the company panel for the islands below it. Each island gets the page's locale as a prop and wraps itself
// in the provider; components shared with /batches and /admin read the context and fall back to Spanish there.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { companyMessages, type CompanyMessages } from '@/i18n/company';
import type { Locale } from '@/lib/locale';

const CompanyTextContext = createContext<CompanyMessages>(companyMessages('es'));

export function CompanyTextProvider({ locale = 'es', children }: { locale?: Locale | undefined; children: ReactNode }) {
  return <CompanyTextContext.Provider value={companyMessages(locale)}>{children}</CompanyTextContext.Provider>;
}

export const useCompanyText = () => useContext(CompanyTextContext);

// False on the server and in the browser's first render, true right after: islands that read shared stores (filled
// by another island that may have hydrated first) render the server's markup first, so hydration matches.
export const useHydrated = () => {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
};
