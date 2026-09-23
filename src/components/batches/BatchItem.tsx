import type { ReactNode, Ref } from 'react';
import { useCompanyText } from '@/components/company/CompanyText';
import { Icon } from '@/components/ui/Icon';
import { LedgerLink } from '@/components/ui/LedgerLink';
import type { CompanyMessages } from '@/i18n/company';
import type { PurchaseSummary } from '@/lib/types';
import type { SummaryEntry } from '@/stores/batches';

export type BatchAction = 'toggle' | 'print' | 'csv' | 'lot-qr' | 'ship' | 'forget' | 'retry';

interface BatchItemProps {
  purchaseId: string;
  summary: SummaryEntry | undefined;
  open: boolean;
  // The label sheet or the payment QR, while open.
  detail: ReactNode;
  itemRef: Ref<HTMLElement>;
  isBusy: (action: BatchAction) => boolean;
  onAction: (action: BatchAction) => void;
}

const batchState = (summary: PurchaseSummary, text: CompanyMessages['batches']['item']) => {
  if (!summary.batchId) return { label: text.waiting, tone: 'pending', icon: 'fa-clock' };
  if (summary.pendingOnChain > 0) return { label: text.registering, tone: 'pending', icon: 'fa-arrows-rotate' };
  if (summary.registeredOnChain > 0 && summary.registeredOnChain === summary.quantity) return { label: text.readyChain, tone: 'ready', icon: 'fa-circle-check' };
  return { label: text.ready, tone: 'ready', icon: 'fa-circle-check' };
};

// Connects the factory's work with the customers who scan the box: how many products of the batch are activated.
function ActivationProgress({ summary }: { summary: PurchaseSummary }) {
  const text = useCompanyText().batches.item;
  const total = Number(summary.quantity) || 0;
  const percent = total ? Math.round((summary.claimed / total) * 100) : 0;
  return (
    <div className="batch-progress">
      <div className="batch-progress-head">
        <span>{text.progress(summary.claimed, total)}</span>
        <span className="batch-progress-percent">{percent}%</span>
      </div>
      <div className="batch-progress-track" role="img" aria-label={text.progressLabel(summary.claimed, total)}>
        <span className="batch-progress-bar" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function BatchItem({ purchaseId, summary, open, detail, itemRef, isBusy, onAction }: BatchItemProps) {
  const t = useCompanyText();
  const text = t.batches.item;
  const shortDate = new Intl.DateTimeFormat(t.intl, { day: 'numeric', month: 'short', year: 'numeric' });
  const button = (action: BatchAction, label: string, icon: string, variant: 'primary' | 'secondary' = 'secondary') => (
    <button
      key={action}
      className={`button button-${variant}`}
      type="button"
      disabled={isBusy(action)}
      aria-expanded={action === 'toggle' ? open : undefined}
      onClick={() => onAction(action)}
    >
      <Icon name={`fa-solid ${icon}`} /> {label}
    </button>
  );

  const content = () => {
    if (!summary) return <p className="batch-item-note">{text.loading}</p>;
    if ('error' in summary) {
      return (
        <>
          <div className="batch-item-head">
            <div className="batch-item-title">
              <span className="batch-id">{purchaseId}</span>
              <h3>{text.unavailable}</h3>
              <p className="batch-meta">{summary.error}</p>
            </div>
          </div>
          <div className="batch-toolbar">
            {button('retry', text.retry, 'fa-rotate-right')}
            {button('forget', text.forget, 'fa-xmark')}
          </div>
        </>
      );
    }

    const state = batchState(summary, text);
    const meta = [
      text.lot(summary.lot),
      text.destination(summary.destination),
      text.tokens(summary.quantity),
      `${summary.amount} ${summary.asset}`,
      summary.createdAt ? shortDate.format(new Date(summary.createdAt)) : ''
    ].filter(Boolean).join(' · ');

    return (
      <>
        <div className="batch-item-head">
          <div className="batch-item-title">
            <span className="batch-id">{summary.batchId ?? text.paymentPending}</span>
            <h3>{summary.model}</h3>
            <p className="batch-meta">{meta}</p>
          </div>
          <span className={`batch-badge is-${state.tone}`}><Icon name={`fa-solid ${state.icon}`} /> {state.label}</span>
        </div>
        {summary.batchId && <ActivationProgress summary={summary} />}
        {summary.shippedAt && (
          <p className="batch-shipped"><Icon name="fa-solid fa-truck" /> {text.shipped(summary.destination, shortDate.format(new Date(summary.shippedAt)))}</p>
        )}
        <div className="batch-toolbar">
          {summary.batchId
            ? [
              button('toggle', open ? text.hideLabels : text.showLabels, open ? 'fa-eye-slash' : 'fa-eye', 'primary'),
              button('print', text.print, 'fa-print'),
              button('csv', text.csv, 'fa-file-csv'),
              button('lot-qr', text.lotQr, 'fa-qrcode'),
              ...(summary.shippedAt ? [] : [button('ship', text.ship, 'fa-truck')])
            ]
            : [
              button('toggle', open ? text.hidePayment : text.showPayment, 'fa-qrcode', 'primary'),
              button('forget', text.forget, 'fa-xmark')
            ]}
        </div>
        {summary.issuanceTxUrl && <LedgerLink href={summary.issuanceTxUrl}>{text.ledger}</LedgerLink>}
      </>
    );
  };

  return (
    <article ref={itemRef} className={`batch-item${open ? ' is-open' : ''}`}>
      <div className="batch-item-summary">{content()}</div>
      {open && <div className="batch-detail">{detail}</div>}
    </article>
  );
}
