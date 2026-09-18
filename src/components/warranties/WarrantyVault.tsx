import { Icon } from '@/components/ui/Icon';
import { LedgerLink } from '@/components/ui/LedgerLink';
import type { Message } from '@/components/ui/StatusMessage';
import { ProductHistory } from '@/components/verification/ProductHistory';
import type { TransferredWarranty, Warranty } from '@/lib/types';
import { formatDay, plural } from '@/lib/format';
import { WarrantyCard } from './WarrantyCard';

export interface TransferControls {
  links: Record<string, string>;
  // Product whose transfer is being registered, and the last result per product.
  busyToken: string | null;
  statuses: Record<string, Message>;
  onOffer: (token: string) => void;
  onCancel: (token: string) => void;
}

interface WarrantyVaultProps {
  // Null until the first load answers.
  warranties: Warranty[] | null;
  // Loading text or the error of the last load; null hides it.
  status: string | null;
  transfers: TransferControls;
  // Products this account passed on to someone else.
  transferred: TransferredWarranty[];
}

function TransferredCard({ product }: { product: TransferredWarranty }) {
  return (
    <article className="warranty-card is-transferred">
      <div className="warranty-head">
        <div className="warranty-thumb" aria-hidden="true"><Icon name="fa-solid fa-right-left" /></div>
        <div className="warranty-top">
          <span className="warranty-badge is-transferred"><Icon name="fa-solid fa-right-left" /> Transferido</span>
          <h3>{product.model}</h3>
        </div>
      </div>
      <p className="transferred-note">
        Este producto fue transferido al usuario <strong>{product.to}</strong> el {formatDay(product.at)}. La garantía sigue vigente a su nombre.
      </p>
      {product.txUrl && <LedgerLink href={product.txUrl} title="Transacción pública del cambio de dueño (Stellar testnet)">Ver la transferencia en Stellar</LedgerLink>}
      <details className="warranty-history">
        <summary>Historial del producto <Icon name="fa-solid fa-chevron-down" /></summary>
        <ProductHistory events={product.history} />
      </details>
    </article>
  );
}

export function WarrantyVault({ warranties, status, transfers, transferred }: WarrantyVaultProps) {
  const count = warranties?.length ?? 0;

  return (
    <section className="vault" aria-labelledby="vault-title">
      <div className="vault-header">
        <h2 id="vault-title">Mis Garantías Activas</h2>
        <span className="vault-count">{count ? `${count} ${plural(count, 'producto', 'productos')}` : ''}</span>
      </div>
      <p className="vault-status" role="status" aria-live="polite" hidden={status === null}>{status}</p>
      <div className="vault-grid">
        {warranties?.map((warranty) => (
          <WarrantyCard
            key={warranty.token}
            warranty={warranty}
            transferLink={warranty.transferExpiresAt ? transfers.links[warranty.token] ?? null : null}
            busy={transfers.busyToken !== null}
            status={transfers.statuses[warranty.token] ?? null}
            onOfferTransfer={() => transfers.onOffer(warranty.token)}
            onCancelTransfer={() => transfers.onCancel(warranty.token)}
          />
        ))}
      </div>
      <div className="vault-empty" hidden={warranties === null || count > 0}>
        <svg viewBox="0 0 96 96" aria-hidden="true" focusable="false">
          <path d="M48 8 16 20v24c0 22 13.6 38.6 32 44 18.4-5.4 32-22 32-44V20L48 8Z" fill="#fde6e4" stroke="#e3261f" strokeWidth="3" strokeLinejoin="miter" />
          <path d="m34 48 10 10 18-20" fill="none" stroke="#e3261f" strokeWidth="4" strokeLinecap="square" strokeLinejoin="miter" />
        </svg>
        <p>No tenés garantías registradas todavía. Escaneá el QR de tu producto arriba para reclamar tu certificado de autenticidad.</p>
      </div>

      {transferred.length > 0 && (
        <div className="vault-transferred">
          <div className="vault-header">
            <h2>Productos que transferiste</h2>
            <span className="vault-count">{transferred.length} {plural(transferred.length, 'producto', 'productos')}</span>
          </div>
          <div className="vault-grid">
            {transferred.map((product) => <TransferredCard key={`${product.token}-${product.at}`} product={product} />)}
          </div>
        </div>
      )}
    </section>
  );
}
