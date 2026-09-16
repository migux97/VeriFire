import type { Warranty } from '@/lib/types';
import { plural } from '@/lib/format';
import { WarrantyCard } from './WarrantyCard';

interface WarrantyVaultProps {
  // Null until the first load answers.
  warranties: Warranty[] | null;
  // Loading text or the error of the last load; null hides it.
  status: string | null;
}

export function WarrantyVault({ warranties, status }: WarrantyVaultProps) {
  const count = warranties?.length ?? 0;

  return (
    <section className="vault" aria-labelledby="vault-title">
      <div className="vault-header">
        <h2 id="vault-title">Mis Garantías Activas</h2>
        <span className="vault-count">{count ? `${count} ${plural(count, 'producto', 'productos')}` : ''}</span>
      </div>
      <p className="vault-status" role="status" aria-live="polite" hidden={status === null}>{status}</p>
      <div className="vault-grid">
        {warranties?.map((warranty) => <WarrantyCard key={warranty.token} warranty={warranty} />)}
      </div>
      <div className="vault-empty" hidden={warranties === null || count > 0}>
        <svg viewBox="0 0 96 96" aria-hidden="true" focusable="false">
          <path d="M48 8 16 20v24c0 22 13.6 38.6 32 44 18.4-5.4 32-22 32-44V20L48 8Z" fill="#fdecee" stroke="#d62839" strokeWidth="3" strokeLinejoin="round" />
          <path d="m34 48 10 10 18-20" fill="none" stroke="#d62839" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p>No tenés garantías registradas todavía. Escaneá el QR de tu producto arriba para reclamar tu certificado de autenticidad.</p>
      </div>
    </section>
  );
}
