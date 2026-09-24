import { Icon } from '@/components/ui/Icon';
import { LedgerLink } from '@/components/ui/LedgerLink';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import type { Message } from '@/components/ui/StatusMessage';
import { ProductHistory } from '@/components/verification/ProductHistory';
import type { TransferredWarranty, Warranty } from '@/lib/types';
import { WarrantyCard } from './WarrantyCard';
import { consumerDate, fillIn, getConsumerMessages, type ConsumerLocale } from '@/i18n/consumer';

const PAGE_SIZE = 6;

export interface TransferControls {
  links: Record<string, string>;
  // Product whose transfer is being registered, and the last result per product.
  busyToken: string | null;
  statuses: Record<string, Message>;
  onOffer: (token: string) => void;
  onCancel: (token: string) => void;
}

export interface ShowcaseControls {
  // Product whose choice is being saved.
  busyToken: string | null;
  onToggle: (token: string, visible: boolean) => void;
}

interface WarrantyVaultProps {
  // Null until the first load answers.
  warranties: Warranty[] | null;
  // Loading text or the error of the last load; null hides it.
  status: string | null;
  transfers: TransferControls;
  showcase: ShowcaseControls;
  // Products this account passed on to someone else.
  transferred: TransferredWarranty[];
  locale?: ConsumerLocale;
}

function TransferredCard({ product, locale }: { product: TransferredWarranty; locale: ConsumerLocale }) {
  const labels = getConsumerMessages(locale);
  const { vault, card } = labels;
  return (
    <article className="warranty-card is-transferred">
      <div className="warranty-head">
        <div className="warranty-thumb" aria-hidden="true"><Icon name="fa-solid fa-right-left" /></div>
        <div className="warranty-top">
          <span className="warranty-badge is-transferred"><Icon name="fa-solid fa-right-left" /> {vault.transferredBadge}</span>
          <h3>{product.model}</h3>
        </div>
      </div>
      <p className="transferred-note">{fillIn(vault.transferredNote, { to: product.to, date: consumerDate(product.at, locale) })}</p>
      {product.txUrl && <LedgerLink href={product.txUrl} title={vault.transferTitle}>{vault.transferLink}</LedgerLink>}
      <details className="warranty-history">
        <summary>{card.history} <Icon name="fa-solid fa-chevron-down" /></summary>
        <ProductHistory events={product.history} locale={locale} />
      </details>
    </article>
  );
}

export function WarrantyVault({ warranties, status, transfers, showcase, transferred, locale = 'es' }: WarrantyVaultProps) {
  const labels = getConsumerMessages(locale);
  const { vault } = labels;
  const pageText = { previous: vault.previous, next: vault.next, page: (page: number, pages: number) => fillIn(vault.pageOf, { page, pages }) };
  const productCount = (count: number) => (count === 1 ? vault.countOne : fillIn(vault.count, { count }));
  const count = warranties?.length ?? 0;
  const active = usePagination(warranties ?? [], PAGE_SIZE);
  const passedOn = usePagination(transferred, PAGE_SIZE);

  return (
    <section className="vault" aria-labelledby="vault-title">
      <div className="vault-header">
        <h2 id="vault-title">{labels.coverage.vault}</h2>
        <span className="vault-count">{count ? productCount(count) : ''}</span>
      </div>
      <p className="vault-status" role="status" aria-live="polite" hidden={status === null}>{status}</p>
      <div className="vault-grid">
        {active.items.map((warranty) => (
          <WarrantyCard
            key={warranty.token}
            warranty={warranty}
            locale={locale}
            transferLink={warranty.transferExpiresAt ? transfers.links[warranty.token] ?? null : null}
            busy={transfers.busyToken !== null}
            status={transfers.statuses[warranty.token] ?? null}
            onOfferTransfer={() => transfers.onOffer(warranty.token)}
            onCancelTransfer={() => transfers.onCancel(warranty.token)}
            showcaseBusy={showcase.busyToken !== null}
            onToggleShowcase={(visible) => showcase.onToggle(warranty.token, visible)}
          />
        ))}
      </div>
      <Pagination page={active.page} pages={active.pages} onPage={active.setPage} label={vault.pagesActive} text={pageText} />
      <div className="vault-empty" hidden={warranties === null || count > 0}>
        <svg viewBox="0 0 96 96" aria-hidden="true" focusable="false">
          <path d="M48 8 16 20v24c0 22 13.6 38.6 32 44 18.4-5.4 32-22 32-44V20L48 8Z" fill="#fde6e4" stroke="#e3261f" strokeWidth="3" strokeLinejoin="miter" />
          <path d="m34 48 10 10 18-20" fill="none" stroke="#e3261f" strokeWidth="4" strokeLinecap="square" strokeLinejoin="miter" />
        </svg>
        <p>{vault.empty}</p>
      </div>

      {transferred.length > 0 && (
        <div className="vault-transferred">
          <div className="vault-header">
            <h2>{vault.transferred}</h2>
            <span className="vault-count">{productCount(transferred.length)}</span>
          </div>
          <div className="vault-grid">
            {passedOn.items.map((product) => <TransferredCard key={`${product.token}-${product.at}`} product={product} locale={locale} />)}
          </div>
          <Pagination page={passedOn.page} pages={passedOn.pages} onPage={passedOn.setPage} label={vault.pagesTransferred} text={pageText} />
        </div>
      )}
    </section>
  );
}
