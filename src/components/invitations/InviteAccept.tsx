// The page behind an invitation link or QR: what is offered, and accepting or declining it. Without a session the
// invitation is kept for after the login, which comes back here.
import { useEffect, useState } from 'react';
import { invitationMessages } from '@/i18n/invitations';
import { storedUser } from '@/lib/client/account';
import { rememberPendingInvite, respondInvitation, tokenFromHash, viewInvitation } from '@/lib/client/invitations';
import { userSession } from '@/lib/client/session';
import { errorMessage } from '@/lib/errors';
import type { Locale } from '@/lib/locale';
import type { InvitationView } from '@/lib/types';
import '@/styles/invitations.css';

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; invitation: InvitationView; token: string };

export function InviteAccept({ locale = 'es' }: { locale?: Locale | undefined }) {
  const t = invitationMessages(locale);
  const text = t.page;
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [result, setResult] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  // With the time: an invitation can last as little as an hour.
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(t.intl, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  useEffect(() => {
    const token = tokenFromHash();
    if (!token) {
      setState({ kind: 'missing' });
      return;
    }
    if (userSession.isActive()) setEmail(storedUser()?.email ?? '');
    viewInvitation(token)
      .then((invitation) => setState({ kind: 'ready', invitation, token }))
      .catch((error: unknown) => setState({ kind: 'error', message: errorMessage(error) }));
  }, []);

  const answer = async (action: 'accept' | 'decline') => {
    if (state.kind !== 'ready') return;
    setBusy(action);
    setResult(null);
    try {
      const invitation = await respondInvitation(state.token, action);
      setState({ ...state, invitation });
      setResult({ text: action === 'accept' ? text.accepted : text.declined, tone: 'success' });
      if (action === 'accept') window.setTimeout(() => window.location.assign('/company'), 1400);
    } catch (error) {
      setResult({ text: errorMessage(error), tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const goLogin = (register: boolean) => {
    if (state.kind === 'ready') rememberPendingInvite(state.token);
    window.location.assign(register ? '/login?modo=registro' : '/login');
  };

  if (state.kind === 'loading')
    return (
      <section className="invite-card is-loading" role="status">
        <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" /> {text.loading}
      </section>
    );

  if (state.kind !== 'ready')
    return (
      <section className="invite-card is-message">
        <span className="invite-icon is-muted" aria-hidden="true">
          <i className="fa-solid fa-envelope-circle-check" />
        </span>
        <p>{state.kind === 'missing' ? text.missing : state.message}</p>
        <a className="invite-button" href="/app">
          {text.home}
        </a>
      </section>
    );

  const { invitation } = state;
  const role = t.roles[invitation.role];
  const answered = invitation.status !== 'pending';

  return (
    <section className="invite-card" aria-labelledby="invite-title">
      <span className="invite-icon" aria-hidden="true">
        <i className="fa-solid fa-users" />
      </span>
      <span className="invite-eyebrow">{text.eyebrow}</span>
      <h1 id="invite-title">{text.heading(invitation.companyName)}</h1>
      <p className="invite-lead">{text.lead(invitation.inviterName, role)}</p>

      <dl className="invite-details">
        <div>
          <dt>{text.company}</dt>
          <dd>{invitation.companyName}</dd>
        </div>
        <div>
          <dt>{text.role}</dt>
          <dd>{role}</dd>
        </div>
        <div>
          <dt>{text.from}</dt>
          <dd>{invitation.inviterName}</dd>
        </div>
      </dl>
      <p className={`invite-meta ${invitation.status === 'expired' ? 'is-expired' : ''}`}>
        <i className={`fa-solid ${invitation.email ? 'fa-envelope' : 'fa-link'}`} aria-hidden="true" />{' '}
        {invitation.email ? text.forEmail(invitation.email) : text.open} · {text.expires(formatDate(invitation.expiresAt))}
      </p>

      {answered && !result ? (
        <>
          <p className="invite-result">{text.status[invitation.status] ?? ''}</p>
          <a className="invite-button" href="/app">
            {text.home}
          </a>
        </>
      ) : result?.tone === 'success' ? (
        <p className="invite-result is-success" role="status">
          <i className="fa-solid fa-circle-check" aria-hidden="true" /> {result.text}
        </p>
      ) : email ? (
        <>
          <p className="invite-as">{text.loggedAs(email)}</p>
          <div className="invite-actions">
            <button type="button" className="invite-button is-primary" disabled={Boolean(busy)} onClick={() => void answer('accept')}>
              {busy === 'accept' ? <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" /> : <i className="fa-solid fa-check" aria-hidden="true" />} {text.accept}
            </button>
            <button type="button" className="invite-button" disabled={Boolean(busy)} onClick={() => void answer('decline')}>
              {text.decline}
            </button>
          </div>
        </>
      ) : (
        <div className="invite-actions">
          <button type="button" className="invite-button is-primary" onClick={() => goLogin(false)}>
            <i className="fa-solid fa-right-to-bracket" aria-hidden="true" /> {text.login}
          </button>
          <button type="button" className="invite-button" onClick={() => goLogin(true)}>
            {text.register}
          </button>
        </div>
      )}
      {result?.tone === 'error' && (
        <p className="invite-result is-error" role="alert">
          {result.text}
        </p>
      )}
    </section>
  );
}
