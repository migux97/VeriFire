import { ACCOUNT_DATA_EVENT } from '@/lib/client/account-data';
import { useEffect, useState } from 'react';
import { storedUser, type StoredUser } from '@/lib/client/account';
import { COMPANY_PROFILE_EVENT, readCompanyProfile } from '@/lib/client/company-profile';
import { companyMemberships, type CompanyRole } from '@/lib/client/workspace';
import { userSession } from '@/lib/client/session';
import type { Locale } from '@/lib/locale';
import { CompanyTextProvider, useCompanyText } from './CompanyText';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'VF';

interface CompanyIdentityProps {
  view?: 'workspace' | 'profile';
  locale?: Locale | undefined;
}

export function CompanyIdentity({ view = 'profile', locale }: CompanyIdentityProps) {
  return (
    <CompanyTextProvider locale={locale}>
      <Identity view={view} />
    </CompanyTextProvider>
  );
}

function Identity({ view }: { view: 'workspace' | 'profile' }) {
  const t = useCompanyText();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [logo, setLogo] = useState('');
  const [role, setRole] = useState<CompanyRole>('admin');

  useEffect(() => {
    const currentUser = storedUser();
    const memberships = currentUser ? companyMemberships(currentUser.email) : [];
    if (!userSession.isActive() || !currentUser || (currentUser.accountType !== 'business' && memberships.length === 0)) {
      window.location.replace('/app');
      return undefined;
    }
    const membership = memberships[0];
    // The profile saved in Configuración updates the card at once.
    const load = () => {
      const user = storedUser() ?? currentUser;
      setUser(user);
      setCompanyName(membership?.companyName || user.companyName || '');
      setLogo(membership ? '' : readCompanyProfile().logo);
    };
    load();
    setRole(membership?.role || 'admin');
    window.addEventListener(COMPANY_PROFILE_EVENT, load);
    window.addEventListener(ACCOUNT_DATA_EVENT, load);
    return () => {
      window.removeEventListener(COMPANY_PROFILE_EVENT, load);
      window.removeEventListener(ACCOUNT_DATA_EVENT, load);
    };
  }, []);

  if (!user) return <span className={view === 'workspace' ? 'company-workspace is-loading' : 'company-profile-identity is-loading'} aria-hidden="true" />;

  return view === 'workspace' ? (
    <div className="company-workspace">
      <span className={`company-workspace-mark ${logo ? 'has-logo' : ''}`} aria-hidden="true">
        {logo ? <img src={logo} alt="" /> : initials(companyName || user.name)}
      </span>
      <span className="company-workspace-text">
        <span className="company-workspace-label">{t.identity.organization}</span>
        <strong>{companyName || t.identity.unconfigured}</strong>
        <span className="company-workspace-meta">
          {t.identity.business} · {t.roles[role]}
        </span>
      </span>
    </div>
  ) : (
    <div className="company-profile-identity">
      <span className="company-avatar" aria-hidden="true">
        {initials(user.name)}
      </span>
      <span className="company-profile-text">
        <strong>{user.name}</strong>
        <small>{user.email}</small>
      </span>
      <span className="company-profile-role">{t.roles[role]}</span>
    </div>
  );
}
