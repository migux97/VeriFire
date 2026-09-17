import { Icon } from '@/components/ui/Icon';
import { LedgerLink } from '@/components/ui/LedgerLink';
import { formatDay, formatMonth } from '@/lib/format';
import type { Warranty } from '@/lib/types';

interface WarrantyCardProps {
  warranty: Warranty;
}

export function WarrantyCard({ warranty }: WarrantyCardProps) {
  const active = warranty.warrantyUntil !== null && new Date(warranty.warrantyUntil).getTime() > Date.now();

  return (
    <article className="warranty-card">
      <div className="warranty-head">
        <div className="warranty-thumb" aria-hidden="true"><Icon name="fa-solid fa-box-open" /></div>
        <div className="warranty-top">
          <span className={`warranty-badge${active ? '' : ' is-expired'}`}>
            <Icon name={`fa-solid ${active ? 'fa-shield-halved' : 'fa-clock-rotate-left'}`} /> {active ? 'Garantía vigente' : 'Cobertura vencida'}
          </span>
          <h3>{warranty.model}</h3>
        </div>
      </div>
      <dl className="warranty-meta">
        <div>
          <dt>Fecha de reclamo</dt>
          <dd>{warranty.claimedAt ? formatDay(warranty.claimedAt) : '—'}</dd>
        </div>
        <div>
          <dt>Vigencia de la cobertura</dt>
          <dd>Garantía oficial hasta {warranty.warrantyUntil ? formatMonth(warranty.warrantyUntil) : '—'}</dd>
          {/* The buyer only ever sees the certification: the transaction that activated the warranty in the contract,
              signed by the issuing account. The payment that bought the batch belongs to the company's treasury. */}
          {warranty.certificateUrl && (
            <dd>
              <LedgerLink href={warranty.certificateUrl} title="Transacción pública que certificó esta garantía en el contrato Verifire (Stellar testnet)">
                Ver certificado en Stellar
              </LedgerLink>
            </dd>
          )}
        </div>
      </dl>
    </article>
  );
}
