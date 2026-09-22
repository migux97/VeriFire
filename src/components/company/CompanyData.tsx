import { CompanyOverview } from './CompanyOverview';
import { useEffect, useState } from 'react';
import { fetchPurchase, savedPurchaseIds } from '@/lib/client/purchases';
import { userSession } from '@/lib/client/session';
import type { PurchaseStatus } from '@/lib/types';

type CompanyRecord = PurchaseStatus;

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
  : 'Pendiente';

export function CompanyData({ view = 'dashboard' }: { view?: 'dashboard' | 'products' | 'activity' }) {
  const [records, setRecords] = useState<CompanyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const purchases = await Promise.all(savedPurchaseIds().map(async (purchaseId) => {
        try {
          const result = await fetchPurchase(purchaseId);
          return result;
        } catch {
          return null;
        }
      }));
      if (active) {
        setFailed(purchases.some((record) => record === null));
        setRecords(purchases.filter((record): record is CompanyRecord => Boolean(record)));
        setLoading(false);
      }
    };
    if (userSession.isActive()) void load();
    else setLoading(false);
    return () => { active = false; };
  }, []);

  const products = records.filter((record): record is Extract<PurchaseStatus, { succeeded: true }> => record.succeeded).flatMap((record) => (record.batch?.tokens ?? []).map((token) => ({
    ...token,
    model: record.purchase.model,
    lot: record.purchase.lot,
    destination: record.purchase.destination,
    createdAt: record.purchase.createdAt
  })));

  if (failed) return <p className="company-data-empty" role="alert">No se pudieron cargar todas las compras. Recargá la página para consultar los datos completos.</p>;



  if (view === 'dashboard') return <CompanyOverview records={records} loading={loading} />;

  return (
    <>
      <section className="company-panel company-products company-real-products" >
        <div className="company-panel-heading"><div><span className="company-eyebrow">Inventario real</span><h2>{view === 'activity' ? 'Estado de los productos' : 'Productos de tu cuenta'}</h2></div><a href="#batches">Ver lotes <i className="fa-solid fa-arrow-right" /></a></div>
        {loading ? <p className="company-data-empty">Cargando los datos de tu cuenta...</p> : products.length === 0 ? <p className="company-data-empty">Todavía no hay productos asociados a esta cuenta. Genera tu primer lote para verlos aquí.</p> : <div className="company-table-wrap"><table className="company-table"><thead><tr><th>Producto</th><th>Modelo</th><th>Estado</th><th>Destino</th><th>Creado</th></tr></thead><tbody>{products.map((product) => <tr key={product.token}><td><strong>{view === 'activity' ? <a href={`/verify?token=${encodeURIComponent(product.token)}`}>{product.token}</a> : product.token}</strong><small>Lote {product.lot}</small></td><td>{product.model}</td><td><span className={`status-pill ${product.status === 'CLAIMED_IN_WARRANTY' ? 'status-warning' : 'status-ok'}`}><i className="fa-solid fa-circle" />{product.status === 'CLAIMED_IN_WARRANTY' ? 'Activado' : 'Sellado'}</span></td><td>{product.destination}</td><td className="table-date">{formatDate(product.createdAt)}</td></tr>)}</tbody></table></div>}
      </section>
    </>
  );
}
