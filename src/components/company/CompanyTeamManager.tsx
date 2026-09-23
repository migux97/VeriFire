// The company's team: who is in it, with which role, and the invitations on their way. An invitation is created on the
// server and sent one of three ways: by email (through Resend, and in the person's panel), as a link, or as a QR.
// Every invitation expires after 3 minutes and works once.
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNow } from '@/components/ui/useNow';
import { storedUser } from '@/lib/client/account';
import { downloadDataUrl } from '@/lib/client/download';
import { createInvitation, invitationLink, invitationStatuses, revokeInvitation, type InvitationEmailStatus } from '@/lib/client/invitations';
import { notify } from '@/lib/client/notifications';
import { readAccountData, writeAccountData } from '@/lib/client/account-data';
import { demoModeActive, userSession } from '@/lib/client/session';
import { updateCompanyMembershipRole, type CompanyRole } from '@/lib/client/workspace';
import { errorMessage } from '@/lib/errors';
import { formatTimeLeft } from '@/lib/format';
import type { Locale } from '@/lib/locale';
import type { InvitationView } from '@/lib/types';
import { CompanyTextProvider, useCompanyText } from './CompanyText';

type MemberStatus = 'active' | 'pending' | 'declined' | 'expired';
type InviteMode = 'email' | 'link' | 'qr';

interface Member {
  id: string;
  name: string;
  // Empty for a link or QR nobody accepted yet.
  email: string;
  role: CompanyRole;
  status: MemberStatus;
  // Set for members invited through the server: its id to follow it, its token to show it again or cancel it.
  invitationId?: string;
  token?: string;
  expiresAt?: string;
  kind?: InviteMode;
  emailStatus?: InvitationEmailStatus | null;
}

const STATUS_CHECK_MS = 15_000;
const roles: CompanyRole[] = ['admin', 'operator', 'auditor', 'viewer'];
const MODES: { value: InviteMode; icon: string }[] = [
  { value: 'email', icon: 'fa-envelope' },
  { value: 'link', icon: 'fa-link' },
  { value: 'qr', icon: 'fa-qrcode' }
];

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

// The invitation just created (or reopened): the email's fate, the link, or the QR, with the time it has left.
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
  const kind: InviteMode = member.kind ?? (member.email ? 'email' : 'link');
  const link = member.token ? invitationLink(member.token) : '';
  const now = useNow(true);
  const left = member.expiresAt ? Date.parse(member.expiresAt) - now : 0;
  const expired = left <= 0;
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(false);
  const zoomDoneRef = useRef<HTMLButtonElement>(null);
  const copiedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  useEffect(() => {
    if (kind !== 'qr' || !link) return undefined;
    let active = true;
    void import('qrcode').then((qrcode) =>
      qrcode.toDataURL(link, { width: 720, margin: 1, errorCorrectionLevel: 'M' }).then((image) => {
        if (active) setQr(image);
      })
    );
    return () => {
      active = false;
    };
  }, [kind, link]);

  useEffect(() => {
    if (!zoom) return undefined;
    zoomDoneRef.current?.focus();
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setZoom(false);
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [zoom]);

  // The code is useless once expired, so the big view closes with it.
  useEffect(() => {
    if (expired) setZoom(false);
  }, [expired]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Without clipboard access the field is selected, so Ctrl+C copies it.
      document.querySelector<HTMLInputElement>('.invite-share-link input')?.select();
      return;
    }
    setCopied(true);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2200);
  };

  const title = kind === 'email' ? text.emailTitle : kind === 'qr' ? text.qrTitle : text.linkTitle;
  const lead = kind === 'email' ? text.emailStatus[member.emailStatus ?? 'sent'](member.email) : kind === 'qr' ? text.shareQr : text.shareLink;
  const emailFailed = kind === 'email' && member.emailStatus && member.emailStatus !== 'sent';
  const icon = kind === 'email' ? (emailFailed ? 'fa-envelope-circle-check' : 'fa-paper-plane') : kind === 'qr' ? 'fa-qrcode' : 'fa-link';

  const countdown = (
    <p className={`invite-share-countdown ${expired ? 'is-expired' : left < 60_000 ? 'is-soon' : ''}`} role={expired ? 'alert' : undefined}>
      <i className={`fa-solid ${expired ? 'fa-circle-exclamation' : 'fa-hourglass-half'}`} aria-hidden="true" />{' '}
      {expired ? text.expiredHelp : text.countdown(formatTimeLeft(left))}
    </p>
  );

  const finishButtons = (
    <>
      {expired && (
        <button type="button" className="company-button is-primary" disabled={regenerating} onClick={onRegenerate}>
          <i className={`fa-solid ${regenerating ? 'fa-circle-notch fa-spin' : 'fa-rotate'}`} aria-hidden="true" />{' '}
          {kind === 'email' ? text.resend : text.regenerate}
        </button>
      )}
      <button type="button" className="company-button is-ghost" onClick={onClose}>
        {text.done}
      </button>
    </>
  );

  return (
    <div className={`invite-share is-${kind} ${emailFailed ? 'is-warning' : ''}`} role="region" aria-label={title}>
      <div className="invite-share-head">
        <span className="invite-share-check" aria-hidden="true">
          <i className={`fa-solid ${icon}`} />
        </span>
        <div>
          <strong>{title}</strong>
          <p>{lead}</p>
        </div>
      </div>

      {kind === 'email' && (
        <div className="invite-share-actions">
          {countdown}
          <div className="invite-share-buttons">{finishButtons}</div>
        </div>
      )}

      {kind === 'link' && (
        <div className="invite-share-actions">
          {countdown}
          <label className="invite-share-link">
            <span className="visually-hidden">Link</span>
            <input value={link} readOnly disabled={expired} onFocus={(event) => event.currentTarget.select()} />
          </label>
          <div className="invite-share-buttons">
            {!expired && (
              <>
                <button type="button" className="company-button is-primary" onClick={() => void copy()}>
                  <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`} aria-hidden="true" /> {copied ? text.copied : text.copy}
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
              </>
            )}
            {finishButtons}
          </div>
        </div>
      )}

      {kind === 'qr' && (
        <div className="invite-share-body">
          <button
            type="button"
            className={`invite-share-qr ${expired ? 'is-expired' : ''}`}
            disabled={expired || !qr}
            aria-label={text.fullscreen}
            onClick={() => setZoom(true)}
          >
            {qr ? <img src={qr} alt={text.qrAlt} width={180} height={180} /> : <span className="company-skeleton" />}
            {expired && (
              <span className="invite-share-expired">
                <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
                {text.expiredQr}
              </span>
            )}
          </button>
          <div className="invite-share-actions">
            {countdown}
            <div className="invite-share-buttons">
              {!expired && (
                <>
                  <button type="button" className="company-button is-primary" disabled={!qr} onClick={() => setZoom(true)}>
                    <i className="fa-solid fa-expand" aria-hidden="true" /> {text.fullscreen}
                  </button>
                  <button type="button" className="company-button" disabled={!qr} onClick={() => void downloadDataUrl(qr, text.qrFile)}>
                    <i className="fa-solid fa-download" aria-hidden="true" /> {text.downloadQr}
                  </button>
                </>
              )}
              {finishButtons}
            </div>
          </div>
        </div>
      )}

      {/* Rendered on the body: the card's entrance animation would otherwise trap a fixed layer inside the card. */}
      {zoom &&
        qr &&
        createPortal(
          <div className="company-page-portal invite-qr-zoom" role="dialog" aria-modal="true" aria-label={text.qrTitle} onClick={() => setZoom(false)}>
            <div className="invite-qr-zoom-card" onClick={(event) => event.stopPropagation()}>
              <img src={qr} alt={text.qrAlt} />
              <strong>{companyName}</strong>
              {countdown}
              <button ref={zoomDoneRef} type="button" className="company-button" onClick={() => setZoom(false)}>
                {text.done}
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function Team() {
  const t = useCompanyText();
  const text = t.team;
  const locale: 'es' | 'en' = t.intl.startsWith('en') ? 'en' : 'es';
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CompanyRole>('operator');
  const [mode, setMode] = useState<InviteMode>('email');
  const [regenerating, setRegenerating] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  // Invitations last minutes, so the list notices an expired one within seconds.
  const now = useNow(true, 5_000);
  const membersRef = useRef<Member[]>([]);
  membersRef.current = members;

  const persist = (next: Member[]) => {
    setMembers(next);
    writeAccountData('company-team', next);
  };

  useEffect(() => {
    const user = storedUser();
    if (!user || !userSession.isActive()) return undefined;
    setCompanyName(user.companyName ?? '');
    const owner: Member = { id: 'owner', name: user.name, email: user.email, role: 'admin', status: 'active' };
    const saved = readAccountData<Member[]>('company-team');
    // Only the owner at first. The account's memberships are the teams it joined elsewhere, not members of this one.
    setMembers(saved ?? [owner]);

    // Follows the invitations on their way: who accepted, who declined, which expired.
    const follow = async () => {
      const pending = membersRef.current.filter((member) => member.invitationId && member.status === 'pending');
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
  const send = async (kind: InviteMode, normalizedEmail: string, inviteRole: CompanyRole, replaces?: Member) => {
    const user = storedUser();
    if (!user) return;
    // Sample companies do not invite real people: the invitation would be real (and its email too), and turning demo
    // mode off would erase the company's only record of it.
    if (demoModeActive()) throw new Error(text.demoBlocked);
    const { invitation, token, emailStatus } = await createInvitation({
      companyName: user.companyName ?? '',
      inviterName: user.name,
      inviterEmail: user.email,
      email: kind === 'email' ? normalizedEmail : '',
      role: inviteRole,
      locale
    });
    const member: Member = {
      id: invitation.id,
      name: kind === 'email' ? normalizedEmail.split('@')[0] || normalizedEmail : text.linkMember,
      email: kind === 'email' ? normalizedEmail : '',
      role: inviteRole,
      status: 'pending',
      invitationId: invitation.id,
      token,
      expiresAt: invitation.expiresAt,
      kind,
      emailStatus
    };
    const kept = membersRef.current.filter((item) => item.id !== replaces?.id && (kind !== 'email' || item.email !== normalizedEmail));
    persist([...kept, member]);
    setSharing(member.id);
  };

  const regenerate = async (member: Member) => {
    setRegenerating(true);
    setNotice(null);
    try {
      await send(member.kind ?? (member.email ? 'email' : 'link'), member.email, member.role, member);
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
    const taken = members.some(
      (member) =>
        normalizedEmail &&
        member.email === normalizedEmail &&
        (member.status === 'active' || (member.status === 'pending' && !expiredLocally(member, Date.now())))
    );
    if (taken) {
      setNotice({ text: text.duplicate, tone: 'error' });
      return;
    }
    setCreating(true);
    setNotice(null);
    try {
      await send(mode, normalizedEmail, role);
      setEmail('');
      setOpen(false);
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
    // A pending invitation is cancelled on the server too, so its link stops working at once.
    if (member?.token && member.status === 'pending' && !expiredLocally(member, Date.now())) {
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
  const kindIcon = (member: Member) => (member.kind === 'qr' ? 'fa-qrcode' : 'fa-link');

  return (
    <div className="team-manager">
      <ul className="team-manager-list">
        {members.map((listed) => {
          const member: Member = expiredLocally(listed, now) ? { ...listed, status: 'expired' } : listed;
          return (
            <li className={`team-manager-member ${member.status === 'declined' || member.status === 'expired' ? 'is-faded' : ''}`} key={member.id}>
              <span className={`team-avatar ${member.status === 'pending' ? 'is-pending' : ''}`} aria-hidden="true">
                {member.email ? initials(member.name) : <i className={`fa-solid ${kindIcon(member)}`} />}
              </span>
              <span className="team-manager-identity">
                <strong>{member.email || member.status === 'active' ? member.name : member.kind === 'qr' ? text.qrMember : text.linkMember}</strong>
                <small>{member.email || text.modes[member.kind ?? 'link']}</small>
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
                {member.token && listed.status === 'pending' && (
                  <button
                    className="company-icon-button is-small"
                    type="button"
                    onClick={() => setSharing(sharing === member.id ? null : member.id)}
                    aria-label={text.shareAgain(member.email || member.name)}
                    aria-expanded={sharing === member.id}
                  >
                    <i className={`fa-solid ${member.kind === 'email' ? 'fa-envelope' : kindIcon(member)}`} aria-hidden="true" />
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
            {MODES.map(({ value, icon }) => (
              <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)}>
                <i className={`fa-solid ${icon}`} aria-hidden="true" /> {text.modes[value]}
              </button>
            ))}
          </div>
          <p className="team-invite-help">{text.modeHelp[mode]}</p>
          {mode === 'email' && (
            <label>
              <span>{text.email}</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={text.emailPlaceholder} autoFocus />
            </label>
          )}
          <label className={mode === 'email' ? '' : 'is-wide'}>
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
          <p className="team-invite-validity-note">
            <i className="fa-solid fa-shield-halved" aria-hidden="true" /> {text.validity}
          </p>
          <div className="team-manager-form-actions">
            <button type="button" className="company-button is-ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
            <button type="submit" className="company-button is-primary" disabled={creating}>
              {creating ? (
                <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
              ) : (
                <i className={`fa-solid ${mode === 'email' ? 'fa-paper-plane' : mode === 'qr' ? 'fa-qrcode' : 'fa-link'}`} aria-hidden="true" />
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
