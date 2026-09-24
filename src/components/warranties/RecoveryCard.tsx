import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { getConsumerMessages, type ConsumerLocale } from '@/i18n/consumer';
import { storedUser } from '@/lib/client/account';
import { PENDING_CAVOS_AUTH_KEY, sendRecoveryLink } from '@/lib/client/email-code';
import { socialRecoveryConfig, socialRecoveryEnrolledHere } from '@/lib/client/social-recovery';
import { writeStored } from '@/lib/client/storage';
import { createCavosAuth } from '@/lib/client/wallet';
import { errorMessage } from '@/lib/errors';
import { isStellarAddress } from '@/lib/validation';

// Cavos asks for a minute between two emails to the same address.
const RESEND_MS = 60_000;

// "Activá la recuperación de tu cuenta": until the account's key is sealed in Cavos' recovery enclave, it can only be
// opened with the password, so a forgotten password on a new device would lose it. Sealing it needs a login proof that
// the 6-digit code does not carry: a link to the email does. Accounts that sign in with Google are sealed on their own.
export function RecoveryCard({ cavosAppId, locale = 'es' }: { cavosAppId: string; locale?: ConsumerLocale }) {
  const text = getConsumerMessages(locale).recovery;
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('recuperacion') === 'activada') {
      setDone(true);
      params.delete('recuperacion');
      const query = params.toString();
      window.history.replaceState({}, document.title, `${window.location.pathname}${query ? `?${query}` : ''}`);
      return;
    }
    const user = storedUser();
    if (!cavosAppId || !user?.email || !isStellarAddress(user.walletAddress) || socialRecoveryEnrolledHere(user.walletAddress)) return;
    void socialRecoveryConfig(cavosAppId).then((config) => setVisible(config.enabled));
  }, [cavosAppId]);

  useEffect(() => {
    if (!sentAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sentAt]);

  const wait = Math.max(0, Math.ceil((sentAt + RESEND_MS - now) / 1000));

  const send = async () => {
    const user = storedUser();
    if (!user?.email) return;
    setBusy(true);
    setError('');
    try {
      await sendRecoveryLink(await createCavosAuth(cavosAppId), user.email);
      // Back from the link, the login page seals the key (see AuthPanel) and returns here.
      writeStored(localStorage, PENDING_CAVOS_AUTH_KEY, { mode: 'enroll', email: user.email, at: Date.now() });
      setSentAt(Date.now());
      setNow(Date.now());
    } catch (failure) {
      setError(`${text.failed} ${errorMessage(failure)}`);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <section className="recovery-card is-done" role="status">
        <span className="recovery-card-icon" aria-hidden="true"><Icon name="fa-solid fa-shield-halved" /></span>
        <div>
          <h2>{text.doneTitle}</h2>
          <p>{text.doneText}</p>
        </div>
        <button type="button" className="recovery-card-close" aria-label={text.close} onClick={() => setDone(false)}>
          <Icon name="fa-solid fa-xmark" />
        </button>
      </section>
    );
  }
  if (!visible) return null;

  return (
    <section className="recovery-card" aria-labelledby="recovery-title">
      <span className="recovery-card-icon" aria-hidden="true"><Icon name="fa-solid fa-life-ring" /></span>
      <div>
        <h2 id="recovery-title">{text.title}</h2>
        <p>{sentAt ? text.sent.replace('{email}', storedUser()?.email ?? '') : text.lead}</p>
        {error && <p className="recovery-card-error" role="alert">{error}</p>}
      </div>
      <button type="button" className="button button-primary" disabled={busy || wait > 0} onClick={() => void send()}>
        <Icon name={`fa-solid ${busy ? 'fa-circle-notch fa-spin' : 'fa-envelope'}`} />{' '}
        {wait > 0 ? text.resendIn.replace('{seconds}', String(wait)) : sentAt ? text.resend : text.action}
      </button>
    </section>
  );
}
