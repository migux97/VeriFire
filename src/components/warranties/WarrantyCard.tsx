import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { LedgerLink } from '@/components/ui/LedgerLink';
import { StatusMessage, type Message } from '@/components/ui/StatusMessage';
import { ProductHistory } from '@/components/verification/ProductHistory';
import { useNow } from '@/components/ui/useNow';
import { formatCountdown, formatDay, formatMonth } from '@/lib/format';
import type { Warranty } from '@/lib/types';

interface WarrantyCardProps {
  warranty: Warranty;
  // The open transfer link, when this browser created it.
  transferLink: string | null;
  busy: boolean;
  status: Message | null;
  onOfferTransfer: () => void;
  onCancelTransfer: () => void;
}

// The open link as text and as a QR, for the new owner to open or scan from their own panel.
function TransferLink({ link }: { link: string }) {
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let current = true;
    // Generated here: the link carries the transfer secret and must never reach a third-party QR service.
    void import('qrcode').then((QRCode) => QRCode.toDataURL(link, { margin: 1, width: 200 })).then((url) => {
      if (current) setQr(url);
    });
    return () => {
      current = false;
    };
  }, [link]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="transfer-link">
      {qr && <img src={qr} alt="QR del link de transferencia" width={160} height={160} />}
      <div className="transfer-link-copy">
        <label>
          Link para el nuevo dueño
          <input type="text" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
        </label>
        <button className="button button-secondary" type="button" onClick={() => void copy()}>
          <Icon name={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`} /> {copied ? 'Copiado' : 'Copiar link'}
        </button>
      </div>
    </div>
  );
}

export function WarrantyCard({ warranty, transferLink, busy, status, onOfferTransfer, onCancelTransfer }: WarrantyCardProps) {
  const active = warranty.warrantyUntil !== null && new Date(warranty.warrantyUntil).getTime() > Date.now();
  const now = useNow(warranty.transferExpiresAt !== null || warranty.nextTransferAt !== null);
  // The link expires and the wait ends on their own: both are checked against the ticking clock.
  const offered = warranty.transferExpiresAt !== null && new Date(warranty.transferExpiresAt).getTime() > now;
  const expired = warranty.transferExpiresAt !== null && !offered;
  const waiting = warranty.nextTransferAt !== null && new Date(warranty.nextTransferAt).getTime() > now;
  const offerLabel = (label: string) => (waiting && warranty.nextTransferAt ? `Podés generar otro link en ${formatCountdown(warranty.nextTransferAt, now)}` : label);

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

      {warranty.history.length > 0 && (
        <details className="warranty-history">
          <summary>Historial del producto <Icon name="fa-solid fa-chevron-down" /></summary>
          <ProductHistory events={warranty.history} />
        </details>
      )}

      {warranty.transferable && (
        <div className="warranty-transfer">
          {offered ? (
            <>
              <p className="warranty-transfer-note">
                <Icon name="fa-solid fa-right-left" /> Transferencia abierta: el producto pasa a quien abra el link con su cuenta Verifire y lo acepte.
              </p>
              {warranty.transferExpiresAt && (
                <p className="transfer-countdown" role="timer">
                  <Icon name="fa-regular fa-clock" /> El link vence en <strong>{formatCountdown(warranty.transferExpiresAt, now)}</strong>
                </p>
              )}
              {transferLink
                ? <TransferLink link={transferLink} />
                : <p className="field-hint">Abriste este link desde otro navegador. Si no lo tenés, generá uno nuevo: el anterior deja de funcionar.</p>}
              <div className="warranty-transfer-actions">
                {!transferLink && (
                  <button className="button button-secondary" type="button" disabled={busy || waiting} onClick={onOfferTransfer}>
                    <Icon name="fa-solid fa-link" /> {offerLabel('Generar un link nuevo')}
                  </button>
                )}
                <button className="button button-secondary" type="button" disabled={busy} onClick={onCancelTransfer}>
                  <Icon name="fa-solid fa-xmark" /> Cancelar transferencia
                </button>
              </div>
            </>
          ) : (
            <>
              {expired && <p className="field-hint">El link de transferencia venció sin que nadie lo aceptara. El producto sigue a tu nombre.</p>}
              <button className="button button-secondary" type="button" disabled={busy || waiting} onClick={onOfferTransfer}>
                <Icon name={`fa-solid ${waiting ? 'fa-hourglass-half' : 'fa-right-left'}`} /> {offerLabel('Transferir a otra persona')}
              </button>
            </>
          )}
          <StatusMessage message={status} />
        </div>
      )}
    </article>
  );
}
