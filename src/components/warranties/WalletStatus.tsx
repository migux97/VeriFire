import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { getConsumerMessages, type ConsumerLocale } from '@/i18n/consumer';
import { storedUser } from '@/lib/client/account';
import { userSession, WALLET_KEY, WALLET_UPDATED_EVENT } from '@/lib/client/session';
import { readStored } from '@/lib/client/storage';
import { shortAddress } from '@/lib/format';
import { isStellarAddress } from '@/lib/validation';

export function WalletStatus({ locale = 'es' }: { locale?: ConsumerLocale }) {
  const labels = getConsumerMessages(locale).wallet;
  const [address, setAddress] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const refresh = () => {
      const cached = readStored<{ address?: string }>(localStorage, WALLET_KEY);
      const user = storedUser();
      const candidate = cached?.address || (user?.email === userSession.email() ? user?.walletAddress : '');
      setAddress(userSession.isActive() && isStellarAddress(candidate) ? candidate : '');
      setNotice('');
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(WALLET_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(WALLET_UPDATED_EVENT, refresh);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setNotice(labels.copied);
    } catch {
      setNotice(labels.copyError);
    }
  };

  return (
    <div className="consumer-wallet">
      <span className="consumer-network"><span aria-hidden="true" />{labels.network}</span>
      <button type="button" className="consumer-address" disabled={!address} onClick={() => void copy()}
        title={address || labels.unavailable} aria-label={address ? `${labels.copy}: ${address}` : labels.unavailable}>
        <Icon name="fa-solid fa-wallet" />
        <span>{address ? shortAddress(address) : '—'}</span>
        <Icon name="fa-regular fa-copy" />
      </button>
      <span className="visually-hidden" role="status">{notice}</span>
    </div>
  );
}
