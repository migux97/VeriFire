import { useEffect, useState } from 'react';
import { storedUser, type StoredUser } from '@/lib/client/account';
import { companyMemberships, type CompanyRole } from '@/lib/client/workspace';
import { userSession } from '@/lib/client/session';

const roleLabels: Record<CompanyRole, string> = {
  admin: 'Administrador',
  operator: 'Operador',
  auditor: 'Auditor',
  viewer: 'Solo lectura'
};

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'VF';

interface CompanyIdentityProps {
  view?: 'workspace' | 'profile';
}

export function CompanyIdentity({ view = 'profile' }: CompanyIdentityProps) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState<CompanyRole>('admin');

  useEffect(() => {
    const currentUser = storedUser();
    const memberships = currentUser ? companyMemberships(currentUser.email) : [];
    if (!userSession.isActive() || !currentUser || (currentUser.accountType !== 'business' && memberships.length === 0)) {
      window.location.replace('/app');
      return;
    }
    const membership = memberships[0];
    setUser(currentUser);
    setCompanyName(membership?.companyName || currentUser.companyName || 'Empresa sin configurar');
    setRole(membership?.role || 'admin');
  }, []);

  if (!user) return null;

  return (
    <>
      {view === 'workspace' && <div className="company-workspace">
        <span className="company-workspace-label">Organización</span>
        <strong>{companyName}</strong>
        <span className="company-workspace-meta">Cuenta empresarial · {roleLabels[role]}</span>
      </div>}
      {view === 'profile' && <div className="company-profile-identity">
        <span className="company-avatar">{initials(user.name)}</span>
        <span><strong>{user.name}</strong><small>{user.email}</small></span>
        <span className="company-profile-role">{roleLabels[role]}</span>
      </div>}
    </>
  );
}
