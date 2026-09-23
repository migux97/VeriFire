// Invitations to company teams in the buyer's panel: a button in the header with how many are waiting, and the list
// to accept or decline them. Accepting one opens the company panel.
import { useEffect, useRef, useState } from 'react';
import { useNow } from '@/components/ui/useNow';
import { invitationMessages } from '@/i18n/invitations';
import { storedUser } from '@/lib/client/account';
import { fetchInbox, respondInvitation } from '@/lib/client/invitations';
import { userSession } from '@/lib/client/session';
import { errorMessage } from '@/lib/errors';
import { formatTimeLeft } from '@/lib/format';
import type { Locale } from '@/lib/locale';
import type { InboxInvitation } from '@/lib/types';
import '@/styles/invitations.css';

// Invitations last 3 minutes, so they are looked for often.
const CHECK_MS = 20_000;

export function InvitationInbox({ locale = 'es' }: { locale?: Locale | undefined }) {
  const t = invitationMessages(locale);
  const text = t.inbox;
  const [invitations, setInvitations] = useState<InboxInvitation[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Invitations last minutes: each one shows its countdown, and an expired one leaves the list.
  const now = useNow(invitations.length > 0);

  useEffect(() => {
    if (!userSession.isActive()) return undefined;
    const load = async () => {
      const email = storedUser()?.email;
      if (!email) return;
      try {
        setInvitations(await fetchInbox(email));
      } catch {
        // Offline or busy: the next check tries again.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), CHECK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('click', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const answer = async (invitation: InboxInvitation, action: 'accept' | 'decline') => {
    setBusy(`${invitation.id}:${action}`);
    setError('');
    try {
      await respondInvitation(invitation.token, action);
      if (action === 'accept') {
        window.location.assign('/company');
        return;
      }
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy('');
    }
  };

  const live = invitations.filter((invitation) => Date.parse(invitation.expiresAt) > now);
  const count = live.length;

  return (
    <div className="invite-inbox" ref={rootRef}>
      <button
        ref={buttonRef}
        className="icon-button invite-inbox-button"
        type="button"
        aria-label={count ? text.buttonCount(count) : text.button}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <i className="fa-regular fa-envelope" aria-hidden="true" />
        {count > 0 && <span className="invite-inbox-badge">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <div className="invite-inbox-panel" role="dialog" aria-label={text.title}>
          <strong className="invite-inbox-title">{text.title}</strong>
          {count ? (
            <ul>
              {live.map((invitation) => (
                <li key={invitation.id}>
                  <span className="invite-icon is-small" aria-hidden="true">
                    <i className="fa-solid fa-building" />
                  </span>
                  <div>
                    <strong>{invitation.companyName}</strong>
                    <small>{text.from(invitation.inviterName, t.roles[invitation.role])}</small>
                    <small className="invite-inbox-countdown">
                      <i className="fa-solid fa-hourglass-half" aria-hidden="true" /> {text.expiresIn(formatTimeLeft(Date.parse(invitation.expiresAt) - now))}
                    </small>
                    <div className="invite-inbox-actions">
                      <button type="button" className="invite-button is-primary is-small" disabled={Boolean(busy)} onClick={() => void answer(invitation, 'accept')}>
                        {busy === `${invitation.id}:accept` && <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />} {text.accept}
                      </button>
                      <button type="button" className="invite-button is-small" disabled={Boolean(busy)} onClick={() => void answer(invitation, 'decline')}>
                        {text.decline}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="invite-inbox-empty">{text.empty}</p>
          )}
          {error && (
            <p className="invite-result is-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
