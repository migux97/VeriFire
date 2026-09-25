import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ACCOUNT_UPDATED_EVENT, storedUser, type StoredUser } from '@/lib/client/account';
import { leaveSession } from '@/lib/client/session';
import { currentTheme, setTheme, THEME_EVENT } from '@/lib/client/theme';
import { CREATE_COMPANY_PATH, hasOwnCompany } from '@/lib/client/company-signup';
import { companyMemberships } from '@/lib/client/workspace';
import { isAdminAccount, VERIFICATION_EVENT } from '@/lib/client/verification';
import { getLandingMessages, type LandingMessages } from '@/i18n/landing';

export function ProfileMenu({ labels = getLandingMessages().profile }: { labels?: LandingMessages['profile'] } = {}) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [companyAccess, setCompanyAccess] = useState(false);
  const [dark, setDark] = useState(false);
  const [admin, setAdmin] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const read = () => {
      const currentUser = storedUser();
      setUser(currentUser);
      setCompanyAccess(Boolean(currentUser && (currentUser.accountType === 'business' || companyMemberships(currentUser.email).length)));
      setAdmin(Boolean(currentUser) && isAdminAccount());
    };
    read();
    setDark(currentTheme() === 'dark');
    // The company side of the account can arrive from the server a moment after the page opens (WorkspaceSync).
    window.addEventListener(ACCOUNT_UPDATED_EVENT, read);
    window.addEventListener(VERIFICATION_EVENT, read);
    return () => {
      window.removeEventListener(ACCOUNT_UPDATED_EVENT, read);
      window.removeEventListener(VERIFICATION_EVENT, read);
    };
  }, []);

  // The header has a switch too: both show the same state.
  useEffect(() => {
    const follow = () => setDark(currentTheme() === 'dark');
    window.addEventListener(THEME_EVENT, follow);
    return () => window.removeEventListener(THEME_EVENT, follow);
  }, []);

  const toggleTheme = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setTheme(dark ? 'light' : 'dark', { x: box.left + box.width / 2, y: box.top + box.height / 2 });
    setDark(!dark);
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('click', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="profile-menu">
      <button
        ref={buttonRef}
        className="icon-button"
        type="button"
        aria-label={labels.title}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="profile-popover"
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="fa-regular fa-user" />
      </button>
      <div id="profile-popover" className="profile-popover" role="dialog" aria-label={labels.title} hidden={!open}>
        <div className="profile-popover-header">
          <span className="profile-avatar" aria-hidden="true">{(user?.name || 'V').charAt(0).toUpperCase()}</span>
          <div className="profile-popover-copy">
            <strong>{user?.name || labels.user}</strong>
            <span>{user?.email || labels.noEmail}</span>
          </div>
        </div>
        <button className="profile-action" type="button" role="switch" aria-checked={dark} onClick={toggleTheme}>
          <Icon name={`fa-solid ${dark ? 'fa-moon' : 'fa-sun'}`} /> {labels.dark}
          <span className="theme-switch" aria-hidden="true"><span /></span>
        </button>
        {companyAccess && <button className="profile-action" type="button" onClick={() => { window.location.href = '/company'; }}>
          <Icon name="fa-solid fa-building" /> {labels.company}
        </button>}
        {admin && <button className="profile-action" type="button" onClick={() => { window.location.href = '/verificacion'; }}>
          <Icon name="fa-solid fa-shield-halved" /> Verificar empresas
        </button>}
        {user && !hasOwnCompany(user) && <button className="profile-action" type="button" onClick={() => { window.location.href = CREATE_COMPANY_PATH; }}>
          <Icon name="fa-solid fa-plus" /> {labels.createCompany}
        </button>}
        <button className="profile-action" type="button" onClick={() => leaveSession('cerrada')}>
          <Icon name="fa-solid fa-arrow-right-from-bracket" /> {labels.logout}
        </button>
      </div>
    </div>
  );
}
