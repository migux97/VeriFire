import { useStore } from '@nanostores/react';
import { useEffect, useState } from 'react';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { fetchPurchaseDetail, savedPurchaseIds } from '@/lib/client/purchases';
import { userSession } from '@/lib/client/session';
import type { Locale } from '@/lib/locale';
import type { PurchaseStatus, PurchaseSummary } from '@/lib/types';
import { $purchaseIds, $summaries, $summariesReady, isSummary } from '@/stores/batches';
import { CompanyOverview } from './CompanyOverview';
import { CompanyTextProvider, useCompanyText, useHydrated } from './CompanyText';

type View = 'dashboard' | 'products' | 'activity';

// The products view and the verifications view list the same tokens, which only come with the secret codes of each
// batch: they are asked for once per page and shared. The overview needs no codes and reads the batch summaries that
// the list of batches keeps up to date.
let details: Promise<(PurchaseStatus | null)[]> | null = null;
const loadDetails = () =>
  (details ??= Promise.all(savedPurchaseIds().map((purchaseId) => fetchPurchaseDetail(purchaseId).catch(() => null))));

export function CompanyData({ view = 'dashboard', locale }: { view?: View; locale?: Locale | undefined }) {
  return (
    <CompanyTextProvider locale={locale}>{view === 'dashboard' ? <Dashboard /> : <Products view={view} />}</CompanyTextProvider>
  );
}

function Dashboard() {
  const ids = useStore($purchaseIds);
  const summaries = useStore($summaries);
  const ready = useStore($summariesReady);
  const hydrated = useHydrated();
  const records = ids.map((id) => summaries[id]).filter((entry): entry is PurchaseSummary => isSummary(entry));
  return <CompanyOverview records={records} loading={!hydrated || !ready} />;
}

function Products({ view }: { view: 'products' | 'activity' }) {
  const t = useCompanyText();
  const [records, setRecords] = useState<PurchaseStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!userSession.isActive()) {
      setLoading(false);
      return undefined;
    }
    void loadDetails().then((purchases) => {
      if (!active) return;
      setFailed(purchases.some((record) => record === null));
      setRecords(purchases.filter((record): record is PurchaseStatus => Boolean(record)));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const formatDate = (value: string | null) =>
    value ? new Intl.DateTimeFormat(t.intl, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : t.common.pending;

  const products = records
    .filter((record): record is Extract<PurchaseStatus, { succeeded: true }> => record.succeeded)
    .flatMap((record) =>
      (record.batch?.tokens ?? []).map((token) => ({
        ...token,
        model: record.purchase.model,
        lot: record.purchase.lot,
        destination: record.purchase.destination,
        createdAt: record.purchase.createdAt
      }))
    );
  const page = usePagination(products, 25);

  return (
    <section className="company-card company-products">
      <div className="company-card-heading">
        <div>
          <span className="company-eyebrow">{t.data.eyebrow}</span>
          <h2>{view === 'activity' ? t.data.activityTitle : t.data.productsTitle}</h2>
        </div>
        <a className="company-link" href="#batches">
          {t.data.seeBatches} <i className="fa-solid fa-arrow-right" aria-hidden="true" />
        </a>
      </div>
      {failed && (
        <p className="company-data-empty is-error" role="alert">
          {t.data.failed}
        </p>
      )}
      {loading ? (
        <div className="company-skeleton-table" role="status" aria-label={t.data.loading}>
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="company-empty">
          <span className="company-empty-icon" aria-hidden="true">
            <i className="fa-solid fa-box-open" />
          </span>
          <p>{t.data.empty}</p>
        </div>
      ) : (
        <div className="company-table-wrap">
          <table className="company-table">
            <thead>
              <tr>
                <th scope="col">{t.data.columns.product}</th>
                <th scope="col">{t.data.columns.model}</th>
                <th scope="col">{t.data.columns.status}</th>
                <th scope="col">{t.data.columns.destination}</th>
                <th scope="col">{t.data.columns.created}</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((product) => (
                <tr key={product.token}>
                  <td>
                    <strong>
                      {view === 'activity' ? <a href={`/verify?token=${encodeURIComponent(product.token)}`}>{product.token}</a> : product.token}
                    </strong>
                    <small>{t.data.lot(product.lot)}</small>
                  </td>
                  <td>{product.model}</td>
                  <td>
                    <span className={`status-pill ${product.status === 'CLAIMED_IN_WARRANTY' ? 'is-claimed' : 'is-sealed'}`}>
                      {product.status === 'CLAIMED_IN_WARRANTY' ? t.data.claimed : t.data.sealed}
                    </span>
                  </td>
                  <td>{product.destination}</td>
                  <td className="table-date">{formatDate(product.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page.page} pages={page.pages} onPage={page.setPage} label={t.data.productsTitle} text={t.pagination} />
        </div>
      )}
    </section>
  );
}
