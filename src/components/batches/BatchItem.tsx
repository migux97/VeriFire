import type { ReactNode, Ref } from 'react';
import { Icon } from '@/components/ui/Icon';
import { LedgerLink } from '@/components/ui/LedgerLink';
import { plural, shortDate } from '@/lib/format';
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

const batchState = (summary: PurchaseSummary) => {
  if (!summary.batchId) return { label: 'Esperando pago', tone: 'pending', icon: 'fa-clock' };
  if (summary.pendingOnChain > 0) return { label: 'Registrando en Stellar', tone: 'pending', icon: 'fa-arrows-rotate' };
  if (summary.registeredOnChain > 0 && summary.registeredOnChain === summary.quantity) return { label: 'Listo · en Stellar', tone: 'ready', icon: 'fa-circle-check' };
  return { label: 'Listo', tone: 'ready', icon: 'fa-circle-check' };
};

// Connects the factory's work with the customers who scan the box: how many products of the batch are activated.
function ActivationProgress({ summary }: { summary: PurchaseSummary }) {
  const total = Number(summary.quantity) || 0;
  const percent = total ? Math.round((summary.claimed / total) * 100) : 0;
  return (
    <div className="batch-progress">
      <div className="batch-progress-head">
        <span>{summary.claimed} / {total} {plural(total, 'activado', 'activados')} por clientes</span>
        <span className="batch-progress-percent">{percent}%</span>
      </div>
      <div className="batch-progress-track" role="img" aria-label={`${summary.claimed} de ${total} productos con la garantía activada`}>
        <span className="batch-progress-bar" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function BatchItem({ purchaseId, summary, open, detail, itemRef, isBusy, onAction }: BatchItemProps) {
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
    if (!summary) return <p className="batch-item-note">Cargando lote...</p>;
    if ('error' in summary) {
      return (
        <>
          <div className="batch-item-head">
            <div className="batch-item-title">
              <span className="batch-id">{purchaseId}</span>
              <h3>Compra no disponible</h3>
              <p className="batch-meta">{summary.error}</p>
            </div>
          </div>
          <div className="batch-toolbar">
            {button('retry', 'Reintentar', 'fa-rotate-right')}
            {button('forget', 'Quitar de la lista', 'fa-xmark')}
          </div>
        </>
      );
    }

    const state = batchState(summary);
    const meta = [
      `Lote ${summary.lot}`,
      `Destino ${summary.destination}`,
      `${summary.quantity} ${plural(summary.quantity, 'token', 'tokens')}`,
      `${summary.amount} ${summary.asset}`,
      summary.createdAt ? shortDate.format(new Date(summary.createdAt)) : ''
    ].filter(Boolean).join(' · ');

    return (
      <>
        <div className="batch-item-head">
          <div className="batch-item-title">
            <span className="batch-id">{summary.batchId ?? 'Pago pendiente'}</span>
            <h3>{summary.model}</h3>
            <p className="batch-meta">{meta}</p>
          </div>
          <span className={`batch-badge is-${state.tone}`}><Icon name={`fa-solid ${state.icon}`} /> {state.label}</span>
        </div>
        {summary.batchId && <ActivationProgress summary={summary} />}
        {summary.shippedAt && (
          <p className="batch-shipped"><Icon name="fa-solid fa-truck" /> Despachado a {summary.destination} el {shortDate.format(new Date(summary.shippedAt))}</p>
        )}
        <div className="batch-toolbar">
          {summary.batchId
            ? [
              button('toggle', open ? 'Ocultar etiquetas' : 'Ver etiquetas', open ? 'fa-eye-slash' : 'fa-eye', 'primary'),
              button('print', 'Imprimir', 'fa-print'),
              button('csv', 'Descargar CSV', 'fa-file-csv'),
              button('lot-qr', 'QR del lote', 'fa-qrcode'),
              ...(summary.shippedAt ? [] : [button('ship', 'Marcar como despachado', 'fa-truck')])
            ]
            : [
              button('toggle', open ? 'Ocultar QR de pago' : 'Ver QR de pago', 'fa-qrcode', 'primary'),
              button('forget', 'Quitar de la lista', 'fa-xmark')
            ]}
        </div>
        {summary.issuanceTxUrl && <LedgerLink href={summary.issuanceTxUrl}>Ver pago de emisión en Stellar</LedgerLink>}
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
