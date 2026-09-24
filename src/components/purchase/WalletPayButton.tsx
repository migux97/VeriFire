// Pays a Cosmos Pay intent from a browser wallet (Freighter and the others the Cosmos Pay web client detects). The
// wallet builds the payment with the intent's memo, which the QR carries but a manual transfer easily forgets.
import { useState } from 'react';
import { useCompanyText } from '@/components/company/CompanyText';
import { postJson } from '@/lib/client/api';
import { errorMessage } from '@/lib/errors';
import type { PurchaseStatus } from '@/lib/types';

interface WalletPayButtonProps {
  purchaseId: string;
  uri: string;
  network: 'public' | 'testnet';
  onPaid?: (status: PurchaseStatus) => void;
}

export function WalletPayButton({ purchaseId, uri, network, onPaid }: WalletPayButtonProps) {
  const t = useCompanyText();
  const text = t.purchase.wallet;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; tone: 'info' | 'error' | 'success' } | null>(null);
  // Set as soon as the wallet sent the payment: from then on only its confirmation is retried, never a second payment.
  const [txHash, setTxHash] = useState('');

  const confirm = async (hash: string) => {
    setBusy(true);
    setStatus({ text: text.confirming, tone: 'info' });
    try {
      const confirmed = await postJson<PurchaseStatus>(
        `/api/purchases/${encodeURIComponent(purchaseId)}/paid`,
        { txHash: hash },
        text.failed
      );
      setStatus({ text: confirmed.succeeded ? text.paid : text.sent, tone: 'success' });
      onPaid?.(confirmed);
    } catch {
      // The payment is on Stellar: Cosmos Pay finds it on its own, and the list keeps checking.
      setStatus({ text: text.sent, tone: 'info' });
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    setBusy(true);
    setStatus({ text: text.opening, tone: 'info' });
    try {
      // Loaded on click: the wallet libraries are only needed by whoever pays from the browser.
      const [{ WebClient, WalletNotFoundError }, freighter, stellarSdk] = await Promise.all([
        import('@cosmosapp/pay_sdk/web'),
        import('@stellar/freighter-api'),
        import('@stellar/stellar-sdk')
      ]);
      const client = new WebClient({ freighter: freighter.default ?? freighter, stellarSdk, network });
      let result;
      try {
        result = await client.pay(uri);
      } catch (error) {
        throw error instanceof WalletNotFoundError ? new Error(text.missing) : error;
      }
      setTxHash(result.txHash);
      setBusy(false);
      await confirm(result.txHash);
      return;
    } catch (error) {
      setStatus({ text: errorMessage(error) || text.failed, tone: 'error' });
    }
    setBusy(false);
  };

  return (
    <div className="wallet-pay">
      {txHash ? (
        <button className="button button-secondary" type="button" disabled={busy} onClick={() => void confirm(txHash)}>
          <i className={`fa-solid ${busy ? 'fa-circle-notch fa-spin' : 'fa-rotate-right'}`} aria-hidden="true" /> {text.retryConfirm}
        </button>
      ) : (
        <button className="button button-primary" type="button" disabled={busy} onClick={() => void pay()}>
          <i className={`fa-solid ${busy ? 'fa-circle-notch fa-spin' : 'fa-wallet'}`} aria-hidden="true" /> {busy ? text.busy : text.action}
        </button>
      )}
      <small className="field-hint">{network === 'testnet' ? text.hintTestnet : text.hint}</small>
      {status && (
        <span className={`wallet-pay-status is-${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>
          {status.text}
        </span>
      )}
    </div>
  );
}
