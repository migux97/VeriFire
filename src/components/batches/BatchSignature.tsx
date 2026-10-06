import { useEffect, useState } from 'react';
import { useCompanyText } from '@/components/company/CompanyText';
import { Icon } from '@/components/ui/Icon';
import { LedgerLink } from '@/components/ui/LedgerLink';
import { fetchEndorsement, signBatch } from '@/lib/client/endorsement';
import { errorMessage } from '@/lib/errors';
import type { EndorsementView } from '@/lib/types';

// Products are still being linked to the signature: their count is read again every so often.
const LINKING_POLL_MS = 8000;

// The company signs the whole batch with its wallet, so the contract names it on every product (see endorsements.ts).
// Draws nothing while the deployed contract cannot take the signature.
export function BatchSignature({ purchaseId, cavosAppId }: { purchaseId: string; cavosAppId: string }) {
  const text = useCompanyText().batches.item.signature;
  const [view, setView] = useState<EndorsementView | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const linking = view?.status === 'signed' && view.linked < view.total;
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchEndorsement(purchaseId)
        .then((next) => !cancelled && setView(next))
        .catch(() => {});
    void load();
    const timer = linking ? window.setInterval(() => void load(), LINKING_POLL_MS) : undefined;
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [purchaseId, linking]);

  if (!view || view.status === 'unavailable') return null;

  if (view.status === 'signed') {
    return (
      <div className="batch-signature is-signed">
        <p>
          <Icon name="fa-solid fa-signature" /> <strong>{text.signed}</strong>
        </p>
        <p className="batch-meta">{text.linked(view.linked, view.total)}</p>
        <LedgerLink href={view.txUrl}>{text.ledger}</LedgerLink>
      </div>
    );
  }

  if (view.status === 'registering') return <p className="batch-signature batch-meta">{text.registering}</p>;

  const sign = async () => {
    setBusy(true);
    setError('');
    try {
      setView(await signBatch(cavosAppId, purchaseId, setProgress));
    } catch (failure) {
      setError(errorMessage(failure) || text.failed);
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <div className="batch-signature">
      <p className="batch-meta">{text.ready}</p>
      <button className="button button-secondary" type="button" disabled={busy} onClick={() => void sign()}>
        <Icon name="fa-solid fa-signature" /> {text.sign}
      </button>
      {(progress || error) && (
        <p className={`batch-meta${error ? ' is-error' : ''}`} role="status">
          {error || progress}
        </p>
      )}
    </div>
  );
}
