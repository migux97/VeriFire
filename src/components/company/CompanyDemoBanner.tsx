// TEMPORARY: the strip that says demo mode is on, with a way out. See src/lib/client/demo.ts.
import { useEffect, useState } from 'react';
import { demoActive, disableDemo } from '@/lib/client/demo';
import type { Locale } from '@/lib/locale';
import { CompanyTextProvider, useCompanyText } from './CompanyText';

export function CompanyDemoBanner({ locale }: { locale?: Locale | undefined }) {
  return (
    <CompanyTextProvider locale={locale}>
      <Banner />
    </CompanyTextProvider>
  );
}

function Banner() {
  const t = useCompanyText();
  const [active, setActive] = useState(false);
  useEffect(() => setActive(demoActive()), []);
  if (!active) return null;
  return (
    <div className="company-demo-banner" role="status">
      <i className="fa-solid fa-flask" aria-hidden="true" />
      <span>{t.demo.banner}</span>
      <button
        type="button"
        onClick={() => {
          disableDemo();
          window.location.reload();
        }}
      >
        {t.demo.turnOff}
      </button>
    </div>
  );
}
