// The company's team: who is in it, with which role, and the invitations on their way. An invitation is created on the
// server, so it reaches the other person's panel (by email) or works as a link and a QR from any device.
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { storedUser } from '@/lib/client/account';
import { downloadDataUrl } from '@/lib/client/download';
import { useNow } from '@/components/ui/useNow';
import { createInvitation, invitationLink, invitationStatuses, revokeInvitation, type ValidHours } from '@/lib/client/invitations';
import { notify } from '@/lib/client/notifications';
import { accountKey, userSession } from '@/lib/client/session';
import { readStored, writeStored } from '@/lib/client/storage';
import { companyMemberships, updateCompanyMembershipRole, type CompanyRole } from '@/lib/client/workspace';
import { errorMessage } from '@/lib/errors';
import type { Locale } from '@/lib/locale';
import type { InvitationView } from '@/lib/types';
import { CompanyTextProvider, useCompanyText } from './CompanyText';

type MemberStatus = 'active' | 'pending' | 'declined' | 'expired';
type InviteMode = 'email' | 'link';

interface Member {
  id: string;
  name: string;
  // Empty for an open link nobody accepted yet.
  email: string;
  role: CompanyRole;
  status: MemberStatus;
  // Set for members invited through the server: its id to follow it, its token to share it again or cancel it.
  invitationId?: string;
  token?: string;
  // When its link and QR stop working, and how long they were given (to create a new one just like it).
  expiresAt?: string;
  validHours?: ValidHours;
}

const STATUS_CHECK_MS = 30_000;
const storageKey = () => accountKey('company-team');
const roles: CompanyRole[] = ['admin', 'operator', 'auditor', 'viewer'];
const VALIDITY: ValidHours[] = [1, 24, 72, 168];
const DEFAULT_VALIDITY: Record<InviteMode, ValidHours> = { link: 24, email: 168 };

// "2 d 4 h", "5 h 12 min", "3 min 05 s": how long an invitation still works.
const timeLeft = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days} d ${hours} h`;
  if (hours) return `${hours} h ${minutes} min`;
  return `${minutes} min ${String(seconds % 60).padStart(2, '0')} s`;
};

const expiredLocally = (member: Member, now: number) => member.status === 'pending' && Boolean(member.expiresAt) && Date.parse(member.expiresAt ?? '') <= now;

const initials = (name: string) =>
  name
    .split(/[\s.]+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

export function CompanyTeamManager({ locale }: { locale?: Locale | undefined }) {
  return (
    <CompanyTextProvider locale={locale}>
      <Team />
    </CompanyTextProvider>
  );
}

// The link and the QR of an invitation, ready to copy, share or download.
function InviteShare({
  member,
  companyName,
  onClose,
  onRegenerate,
  regenerating
}: {
  member: Member;
  companyName: string;
  onClose: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const t = useCompanyText();
  const text = t.team;
  const link = member.token ? invitationLink(member.token) : '';
  const now = useNow(Boolean(member.expiresAt));
  const left = member.expiresAt ? Date.parse(member.expiresAt) - now : Infinity;
  const expired = left <= 0;
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  useEffect(() => {
    if (!link) return;
    let active = true;
    void import('qrcode').then((qrcode) =>
      qrcode.toDataURL(link, { width: 480, margin: 1, errorCorrectionLevel: 'M' }).then((image) => {
        if (active) setQr(image);
      })
    );
    return () => {
      active = false;
    };
  }, [link]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Without clipboard access the field is selected, so Ctrl+C copies it.
      document.querySelector<HTMLInputElement>('.invite-share-link input')?.select();
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="invite-share" role="region" aria-label={text.shareTitle}>
      <div className="invite-share-head">
        <span className="invite-share-check" aria-hidden="true">
          <i className="fa-solid fa-paper-plane" />
        </span>
        <div>
          <strong>{text.shareTitle}</strong>
          <p>{member.email ? text.shareTo(member.email) : text.shareOpen}</p>
        </div>
      </div>
      <div className="invite-share-body">
        <div className={`invite-share-qr ${expired ? 'is-expired' : ''}`}>
          {qr ? <img src={qr} alt={text.qrAlt} width={180} height={180} /> : <span className="company-skeleton" />}
          {expired && (
            <span className="invite-share-expired">
              <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
              {text.expiredQr}
            </span>
          )}
        </div>
        <div className="invite-share-actions">
          {Number.isFinite(left) && (
            <p className={`invite-share-countdown ${expired ? 'is-expired' : left < 60 * 60 * 1000 ? 'is-soon' : ''}`} role={expired ? 'alert' : undefined}>
              <i className={`fa-solid ${expired ? 'fa-circle-exclamation' : 'fa-hourglass-half'}`} aria-hidden="true" />{' '}
              {expired ? text.expiredHelp : text.countdown(timeLeft(left))}
            </p>
          )}
          <label className="invite-share-link">
            <span className="visually-hidden">Link</span>
            <input value={link} readOnly disabled={expired} onFocus={(event) => event.currentTarget.select()} />
          </label>
          {expired ? (
            <div className="invite-share-buttons">
              <button type="button" className="company-button is-primary" disabled={regenerating} onClick={onRegenerate}>
                <i className={`fa-solid ${regenerating ? 'fa-circle-notch fa-spin' : 'fa-rotate'}`} aria-hidden="true" /> {text.regenerate}
              </button>
              <button type="button" className="company-button is-ghost" onClick={onClose}>
                {text.done}
              </button>
            </div>
          ) : (
            <div className="invite-share-buttons">
              <button type="button" className="company-button is-primary" onClick={() => void copy()}>
                <i className={`fa-solid ${copied ? 'fa-check' : 'fa-link'}`} aria-hidden="true" /> {copied ? text.copied : text.copy}
              </button>
              {canShare && (
                <button
                  type="button"
                  className="company-button"
                  onClick={() => void navigator.share({ title: 'Verifire', text: text.shareText(companyName), url: link }).catch(() => {})}
                >
                  <i className="fa-solid fa-share-nodes" aria-hidden="true" /> {text.share}
                </button>
              )}
              <button type="button" className="company-button" disabled={!qr} onClick={() => void downloadDataUrl(qr, text.qrFile)}>
                <i className="fa-solid fa-download" aria-hidden="true" /> {text.downloadQr}
              </button>
              <button type="button" className="company-button is-ghost" onClick={onClose}>
                {text.done}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Team() {
  const t = useCompanyText();
  const text = t.team;
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CompanyRole>('operator');
  const [mode, setMode] = useState<InviteMode>('email');
  const [validHours, setValidHours] = useState<ValidHours>(DEFAULT_VALIDITY.email);
  const [regenerating, setRegenerating] = useState(false);
  // Once a minute is enough for the list; the open share panel keeps its own countdown.
  const now = useNow(true, 60_000);
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const membersRef = useRef<Member[]>([]);
  membersRef.current = members;

  const persist = (next: Member[]) => {
    setMembers(next);
    writeStored(localStorage, storageKey(), next);
  };

  useEffect(() => {
    const user = storedUser();
    if (!user || !userSession.isActive()) return undefined;
    setCompanyName(user.companyName ?? '');
    const owner: Member = { id: 'owner', name: user.name, email: user.email, role: 'admin', status: 'active' };
    const saved = readStored<Member[]>(localStorage, storageKey());
    setMembers(
      saved ?? [
        owner,
        ...companyMemberships(user.email).map((membership) => ({
          id: membership.invitationId,
          name: membership.email.split('@')[0] || membership.email,
          email: membership.email,
          role: membership.role,
          status: 'active' as const
        }))
      ]
    );

    // Follows the invitations on their way: who accepted, who declined, which expired.
    const follow = async () => {
      const current = membersRef.current;
      const pending = current.filter((member) => member.invitationId && member.status === 'pending');
      if (!pending.length) return;
      let views: InvitationView[];
      try {
        views = await invitationStatuses(pending.map((member) => member.invitationId as string));
      } catch {
        return;
      }
      const byId = new Map(views.map((view) => [view.id, view]));
      let changed = false;
      const next = membersRef.current.map((member) => {
        const view = member.invitationId ? byId.get(member.invitationId) : undefined;
        if (!view || member.status !== 'pending' || view.status === 'pending') return member;
        changed = true;
        const who = view.acceptedBy || member.email || text.linkMember;
        const params = { who, company: view.companyName, role: view.role };
        if (view.status === 'accepted') {
          notify({ id: `invite-accepted:${view.id}`, kind: 'inviteAccepted', params, href: '#team' });
          const accepted = view.acceptedBy ?? member.email;
          return { ...member, status: 'active' as const, email: accepted, name: member.email ? member.name : accepted.split('@')[0] || accepted };
        }
        if (view.status === 'declined') {
          notify({ id: `invite-declined:${view.id}`, kind: 'inviteDeclined', params, href: '#team' });
          return { ...member, status: 'declined' as const };
        }
        return { ...member, status: 'expired' as const };
      });
      if (changed) persist(next);
    };
    const first = window.setTimeout(() => void follow(), 400);
    const timer = window.setInterval(() => void follow(), STATUS_CHECK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  // Creates the invitation on the server and adds it to the list, replacing `replaces` (an expired one) if given.
  const send = async (normalizedEmail: string, inviteRole: CompanyRole, hours: ValidHours, replaces?: Member) => {
    const user = storedUser();
    if (!user) return;
    const { invitation, token } = await createInvitation({
      companyName: user.companyName ?? '',
      inviterName: user.name,
      inviterEmail: user.email,
      email: normalizedEmail,
      role: inviteRole,
      validHours: hours
    });
    const member: Member = {
      id: invitation.id,
      name: normalizedEmail ? normalizedEmail.split('@')[0] || normalizedEmail : text.linkMember,
      email: normalizedEmail,
      role: inviteRole,
      status: 'pending',
      invitationId: invitation.id,
      token,
      expiresAt: invitation.expiresAt,
      validHours: hours
    };
    const kept = membersRef.current.filter((item) => item.id !== replaces?.id && (!normalizedEmail || item.email !== normalizedEmail));
    persist([...kept, member]);
    setSharing(member.id);
  };

  const regenerate = async (member: Member) => {
    setRegenerating(true);
    setNotice(null);
    try {
      await send(member.email, member.role, member.validHours ?? DEFAULT_VALIDITY[member.email ? 'email' : 'link'], member);
    } catch (error) {
      setNotice({ text: errorMessage(error), tone: 'error' });
    } finally {
      setRegenerating(false);
    }
  };

  const invite = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = mode === 'email' ? email.trim().toLowerCase() : '';
    if (mode === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setNotice({ text: text.invalidEmail, tone: 'error' });
      return;
    }
    if (normalizedEmail && members.some((member) => member.email === normalizedEmail && member.status !== 'declined' && member.status !== 'expired')) {
      setNotice({ text: text.duplicate, tone: 'error' });
      return;
    }
    setCreating(true);
    setNotice(null);
    try {
      // Inviting someone again replaces their previous declined or expired row.
      await send(normalizedEmail, role, validHours);
      setEmail('');
      setOpen(false);
      if (normalizedEmail) setNotice({ text: text.invited(normalizedEmail), tone: 'success' });
    } catch (error) {
      setNotice({ text: errorMessage(error), tone: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const updateRole = (id: string, nextRole: CompanyRole) => {
    const member = members.find((item) => item.id === id);
    if (member?.email) updateCompanyMembershipRole(member.email, nextRole);
    persist(members.map((item) => (item.id === id ? { ...item, role: nextRole } : item)));
    setNotice({ text: text.roleUpdated, tone: 'success' });
  };

  const removeMember = async (id: string) => {
    const member = members.find((item) => item.id === id);
    persist(members.filter((item) => item.id !== id));
    if (sharing === id) setSharing(null);
    setNotice({ text: text.revoked, tone: 'success' });
    // A pending invitation is cancelled on the server too, so its link stops working.
    if (member?.token && member.status === 'pending') {
      try {
        await revokeInvitation(member.token);
      } catch {
        setNotice({ text: text.revokeFailed, tone: 'error' });
      }
    }
  };

  const statusLabel = (status: MemberStatus) =>
    status === 'pending' ? text.pending : status === 'declined' ? text.declined : status === 'expired' ? text.expired : text.active;
  const statusClass = (status: MemberStatus) => (status === 'active' ? 'is-claimed' : status === 'pending' ? 'is-pending' : '');
  const shared = members.find((member) => member.id === sharing);

  return (
    <div className="team-manager">
      <ul className="team-manager-list">
        {members.map((listed) => {
          const member: Member = expiredLocally(listed, now) ? { ...listed, status: 'expired' } : listed;
          return (
            <li className={`team-manager-member ${member.status === 'declined' || member.status === 'expired' ? 'is-faded' : ''}`} key={member.id}>
              <span className={`team-avatar ${member.status === 'pending' ? 'is-pending' : ''}`} aria-hidden="true">
                {member.email ? initials(member.name) : <i className="fa-solid fa-link" />}
              </span>
              <span className="team-manager-identity">
                <strong>{member.name}</strong>
                <small>{member.email || text.modes.link}</small>
              </span>
              <span className={`status-pill ${statusClass(member.status)}`}>{statusLabel(member.status)}</span>
              <select
                aria-label={text.roleOf(member.email || member.name)}
                value={member.role}
                disabled={member.id === 'owner' || member.status !== 'active'}
                onChange={(event) => updateRole(member.id, event.target.value as CompanyRole)}
              >
                {roles.map((value) => (
                  <option value={value} key={value}>
                    {t.roles[value]}
                  </option>
                ))}
              </select>
              <span className="team-manager-actions">
                {member.token && (member.status === 'pending' || (member.status === 'expired' && listed.status === 'pending')) && (
                  <button
                    className="company-icon-button is-small"
                    type="button"
                    onClick={() => setSharing(sharing === member.id ? null : member.id)}
                    aria-label={text.shareAgain(member.email || member.name)}
                    aria-expanded={sharing === member.id}
                  >
                    <i className="fa-solid fa-qrcode" aria-hidden="true" />
                  </button>
                )}
                {member.id !== 'owner' && (
                  <button
                    className="company-icon-button is-small"
                    type="button"
                    onClick={() => void removeMember(member.id)}
                    aria-label={text.revokeLabel(member.email || member.name)}
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {shared && (
        <InviteShare
          key={shared.id}
          member={shared}
          companyName={companyName}
          regenerating={regenerating}
          onRegenerate={() => void regenerate(shared)}
          onClose={() => setSharing(null)}
        />
      )}

      {open && (
        <form className="team-manager-form" onSubmit={(event) => void invite(event)} noValidate>
          <div className="team-invite-modes" role="radiogroup" aria-label={text.modeLabel}>
            {(['email', 'link'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => {
                  setMode(value);
                  setValidHours(DEFAULT_VALIDITY[value]);
                }}
              >
                <i className={`fa-solid ${value === 'email' ? 'fa-envelope' : 'fa-qrcode'}`} aria-hidden="true" /> {text.modes[value]}
              </button>
            ))}
          </div>
          <p className="team-invite-help">{text.modeHelp[mode]}</p>
          {mode === 'email' && (
            <label>
              <span>{text.email}</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="persona@empresa.com" autoFocus />
            </label>
          )}
          <label className={mode === 'link' ? 'is-wide' : ''}>
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
          <div className="team-form-field is-wide">
            <span id="invite-validity-label">{text.expiresIn}</span>
            <div className="team-invite-validity" role="radiogroup" aria-labelledby="invite-validity-label">
              {VALIDITY.map((hours) => (
                <button key={hours} type="button" role="radio" aria-checked={validHours === hours} onClick={() => setValidHours(hours)}>
                  {text.expiryOptions[hours]}
                </button>
              ))}
            </div>
          </div>
          <div className="team-manager-form-actions">
            <button type="button" className="company-button is-ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
            <button type="submit" className="company-button is-primary" disabled={creating}>
              {creating ? (
                <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
              ) : (
                <i className={`fa-solid ${mode === 'email' ? 'fa-paper-plane' : 'fa-link'}`} aria-hidden="true" />
              )}{' '}
              {creating ? text.creating : text.create}
            </button>
          </div>
        </form>
      )}

      <div className="team-manager-footer">
        {!open && (
          <button
            className="team-invite"
            type="button"
            onClick={() => {
              setOpen(true);
              setSharing(null);
              setNotice(null);
            }}
          >
            <i className="fa-solid fa-user-plus" aria-hidden="true" /> {text.invite}
          </button>
        )}
        {notice && (
          <span className={notice.tone === 'success' ? 'team-manager-notice' : 'settings-error'} role={notice.tone === 'error' ? 'alert' : 'status'}>
            {notice.text}
          </span>
        )}
      </div>
    </div>
  );
}
