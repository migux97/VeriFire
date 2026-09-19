import { Pagination, usePagination } from '@/components/ui/Pagination';
import type { CompanyBatch, ProductLabel } from '@/lib/types';

const PAGE_SIZE = 12;

export type QrKind = 'public' | 'secret';

interface LabelSheetProps {
  batch: CompanyBatch;
  // While printing, every label of the batch is in the page, not only the current page.
  showAll: boolean;
  isDownloading: (token: string, kind: QrKind) => boolean;
  onDownloadQr: (token: string, kind: QrKind) => void;
}

function LabelCode({ label, kind, busy, onDownload }: { label: ProductLabel; kind: QrKind; busy: boolean; onDownload: () => void }) {
  const secret = kind === 'secret';
  return (
    <div className="label-code">
      <img src={secret ? label.secretQr : label.publicQr} alt={`QR ${secret ? 'secreto' : 'público'} del producto ${label.token}`} width={120} height={120} />
      <span>{secret ? 'Interior · secreto' : 'Exterior de la caja'}</span>
      <button className="label-download" type="button" disabled={busy} onClick={onDownload}>Descargar</button>
    </div>
  );
}

// Printed on its own: while a sheet is open, printing the page prints only its labels (see @media print).
export function LabelSheet({ batch, showAll, isDownloading, onDownloadQr }: LabelSheetProps) {
  const labels = usePagination(batch.tokens, PAGE_SIZE);
  return (
    <>
      <p>Cada producto tiene dos QR:</p>
      <ul className="batch-guide">
        <li><strong>QR público, por fuera de la caja.</strong> Cualquiera lo escanea sin iniciar sesión y solo ve los datos públicos del producto.</li>
        <li><strong>QR secreto, adentro del empaque.</strong> El cliente lo escanea desde su panel de Verifire para activar la garantía. Sirve una sola vez.</li>
      </ul>
      <p className="batch-item-note">El CSV incluye los códigos secretos: guardalo solo para el control interno de tu empresa.</p>
      <div className="label-sheet">
        {(showAll ? batch.tokens : labels.items).map((label) => (
          <figure key={label.token} className="secret-label">
            <div className="label-codes">
              {(['public', 'secret'] as const).map((kind) => (
                <LabelCode
                  key={kind}
                  label={label}
                  kind={kind}
                  busy={isDownloading(label.token, kind)}
                  onDownload={() => onDownloadQr(label.token, kind)}
                />
              ))}
            </div>
            <figcaption><strong>{label.token}</strong></figcaption>
          </figure>
        ))}
      </div>
      <Pagination page={labels.page} pages={labels.pages} onPage={labels.setPage} label="Páginas de etiquetas" />
    </>
  );
}
