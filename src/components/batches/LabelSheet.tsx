import { useCompanyText } from '@/components/company/CompanyText';
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
  const text = useCompanyText().batches.labels;
  const secret = kind === 'secret';
  return (
    <div className="label-code">
      <img src={secret ? label.secretQr : label.publicQr} alt={text.alt(secret, label.token)} width={120} height={120} />
      <span>{secret ? text.secret : text.public}</span>
      <button className="label-download" type="button" disabled={busy} onClick={onDownload}>{text.download}</button>
    </div>
  );
}

// Printed on its own: while a sheet is open, printing the page prints only its labels (see @media print).
export function LabelSheet({ batch, showAll, isDownloading, onDownloadQr }: LabelSheetProps) {
  const t = useCompanyText();
  const text = t.batches.labels;
  const labels = usePagination(batch.tokens, PAGE_SIZE);
  return (
    <>
      <p>{text.intro}</p>
      <ul className="batch-guide">
        <li><strong>{text.publicGuide}</strong> {text.publicGuideText}</li>
        <li><strong>{text.secretGuide}</strong> {text.secretGuideText}</li>
      </ul>
      <p className="batch-item-note">{text.csvNote}</p>
      <div className="label-sheet">
        {(showAll ? batch.tokens : labels.items).map((label) => (
          <figure key={label.token} className={`secret-label ${batch.configuration?.labelStyle === 'compact' ? 'label-compact' : ''}`}>
            {batch.configuration && <div className="label-branding"><strong>{batch.configuration.brand}</strong><span>{batch.model}</span><small>{text.lot(batch.lot)}</small></div>}
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
            <figcaption><strong>{label.token}</strong>{batch.configuration?.labelText && <p>{batch.configuration.labelText}</p>}</figcaption>
          </figure>
        ))}
      </div>
      <Pagination page={labels.page} pages={labels.pages} onPage={labels.setPage} label={text.pages} text={t.pagination} />
    </>
  );
}
