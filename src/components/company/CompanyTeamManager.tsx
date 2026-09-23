import { useEffect, useState, type SyntheticEvent } from 'react';
import { companyMemberships, createCompanyInvitation, updateCompanyMembershipRole, type CompanyRole } from '@/lib/client/workspace';
import { storedUser } from '@/lib/client/account';
import { accountKey, userSession } from '@/lib/client/session';
import { readStored, writeStored } from '@/lib/client/storage';
import type { Locale } from '@/lib/locale';
import { CompanyTextProvider, useCompanyText } from './CompanyText';

type MemberStatus = 'active' | 'pending';

interface Member {
  id: string;
  name: string;
  email: string;
  role: CompanyRole;
  status: MemberStatus;
}

const storageKey = () => accountKey('company-team');
const roles: CompanyRole[] = ['admin', 'operator', 'auditor', 'viewer'];

const initials = (name: string) =>
  name
    .split(/[\s.]+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function CompanyTeamManager({ locale }: { locale?: Locale | undefined }) {
  return (
    <CompanyTextProvider locale={locale}>
      <Team />
    </CompanyTextProvider>
  );
}

function Team() {
  const t = useCompanyText();
  const text = t.team;
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CompanyRole>('operator');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const user = storedUser();
    if (!user || !userSession.isActive()) return;
    const owner: Member = { id: 'owner', name: user.name, email: user.email, role: 'admin', status: 'active' };
    try {
      const saved = readStored<Member[]>(localStorage, storageKey());
      if (saved) {
        setMembers(saved);
        return;
      }
      const memberships = companyMemberships(user.email);
      setMembers([
        owner,
        ...memberships.map((membership) => ({
          id: membership.invitationId,
          name: membership.email.split('@')[0] || membership.email,
          email: membership.email,
          role: membership.role,
          status: 'active' as const
        }))
      ]);
    } catch {
      setMembers([owner]);
    }
  }, []);

  const persist = (next: Member[]) => {
    setMembers(next);
    writeStored(localStorage, storageKey(), next);
  };

  const invite = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setNotice(text.invalidEmail);
      return;
    }
    if (members.some((member) => member.email === normalizedEmail)) {
      setNotice(text.duplicate);
      return;
    }
    createCompanyInvitation(normalizedEmail, role, storedUser()?.companyName ?? '');
    persist([...members, { id: crypto.randomUUID(), name: normalizedEmail.split('@')[0] || normalizedEmail, email: normalizedEmail, role, status: 'pending' }]);
    setEmail('');
    setNotice(text.invited(normalizedEmail));
    setOpen(false);
  };

  const updateRole = (id: string, nextRole: CompanyRole) => {
    const member = members.find((item) => item.id === id);
    if (member) updateCompanyMembershipRole(member.email, nextRole);
    persist(members.map((item) => (item.id === id ? { ...item, role: nextRole } : item)));
    setNotice(text.roleUpdated);
  };

  const removeMember = (id: string) => {
    persist(members.filter((member) => member.id !== id));
    setNotice(text.revoked);
  };

  return (
    <div className="team-manager">
      <ul className="team-manager-list">
        {members.map((member) => (
          <li className="team-manager-member" key={member.id}>
            <span className={`team-avatar ${member.status === 'pending' ? 'is-pending' : ''}`} aria-hidden="true">
              {initials(member.name)}
            </span>
            <span className="team-manager-identity">
              <strong>{member.name}</strong>
              <small>{member.email}</small>
            </span>
            <span className={`status-pill ${member.status === 'pending' ? 'is-pending' : 'is-claimed'}`}>
              {member.status === 'pending' ? text.pending : text.active}
            </span>
            <select aria-label={text.roleOf(member.email)} value={member.role} disabled={member.id === 'owner'} onChange={(event) => updateRole(member.id, event.target.value as CompanyRole)}>
              {roles.map((value) => (
                <option value={value} key={value}>
                  {t.roles[value]}
                </option>
              ))}
            </select>
            {member.id !== 'owner' ? (
              <button className="company-icon-button is-small" type="button" onClick={() => removeMember(member.id)} aria-label={text.revokeLabel(member.email)}>
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            ) : (
              <span className="team-manager-spacer" aria-hidden="true" />
            )}
          </li>
        ))}
      </ul>

      {open && (
        <form className="team-manager-form" onSubmit={invite}>
          <label>
            <span>{text.email}</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="persona@empresa.com" autoFocus />
          </label>
          <label>
            <span>{text.role}</span>
            <select value={role} onChange={(event) => setRole(event.target.value as CompanyRole)}>
              {roles.map((value) => (
                <option value={value} key={value}>
                  {t.roles[value]}
                </option>
              ))}
            </select>
            <small>{text.roleHelp[role]}</small>
          </label>
          <div className="team-manager-form-actions">
            <button type="button" className="company-button is-ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
            <button type="submit" className="company-button is-primary">
              {text.create}
            </button>
          </div>
        </form>
      )}

      <div className="team-manager-footer">
        <button className="team-invite" type="button" onClick={() => setOpen((value) => !value)}>
          <i className="fa-solid fa-user-plus" aria-hidden="true" /> {open ? text.closeInvite : text.invite}
        </button>
        {notice && (
          <span className="team-manager-notice" role="status">
            {notice}
          </span>
        )}
      </div>
    </div>
  );
}
