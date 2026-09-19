import { Icon } from '@/components/ui/Icon';
import { LedgerLink } from '@/components/ui/LedgerLink';
import { formatLongDate } from '@/lib/format';
import type { HistoryEvent, HistoryKind } from '@/lib/types';

const EVENTS: Record<HistoryKind, { title: string; icon: string }> = {
  minted: { title: 'Registrado en el contrato', icon: 'fa-solid fa-file-signature' },
  shipped: { title: 'Despachado a su destino', icon: 'fa-solid fa-truck' },
  verified: { title: 'Verificado con el QR público', icon: 'fa-solid fa-qrcode' },
  activated: { title: 'Garantía activada con el QR secreto', icon: 'fa-solid fa-key' },
  rejected: { title: 'Activación rechazada', icon: 'fa-solid fa-ban' },
  transferred: { title: 'Transferido a otro usuario', icon: 'fa-solid fa-right-left' }
};

const titleOf = (event: HistoryEvent) => {
  // A product not registered yet was only issued: it has no contract record to show.
  if (event.kind === 'minted' && !event.txUrl) return 'Etiqueta emitida';
  if (event.kind === 'transferred' && event.to) return `Transferido al usuario ${event.to}`;
  return EVENTS[event.kind].title;
};

interface ProductHistoryProps {
  events: HistoryEvent[];
  // Server-rendered pages pass UTC and add LocalDates.astro, which rewrites the dates in the visitor's time zone.
  timeZone?: string;
}

// Every moment of a product, oldest first. Events backed by a Stellar transaction link to it.
export function ProductHistory({ events, timeZone }: ProductHistoryProps) {
  return (
    <ol className="history">
      {events.map((event, index) => {
        const { icon } = EVENTS[event.kind];
        return (
          <li key={`${event.kind}-${event.at}-${index}`} className={`history-event is-${event.kind}`}>
            <span className="history-icon"><Icon name={icon} /></span>
            <div className="history-body">
              <strong>{titleOf(event)}</strong>
              {event.detail && <span>{event.detail}</span>}
              <time className="history-date" dateTime={event.at} data-local-date="">{formatLongDate(event.at, timeZone)}</time>
              {event.txUrl && <LedgerLink href={event.txUrl} title="Transacción pública en Stellar testnet">Ver en Stellar</LedgerLink>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
