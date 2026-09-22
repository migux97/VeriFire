import { useEffect, useState } from 'react';
import { fetchPurchase, savedPurchaseIds } from '@/lib/client/purchases';
import { userSession } from '@/lib/client/session';
import type { PurchaseStatus } from '@/lib/types';

type CompanyRecord = PurchaseStatus;

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
  : 'Pendiente';

export function CompanyData() {
  const [records, setRecords] = useState<CompanyRecord[]>([]);
  const [loading, setLoading] = useState(true);

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
        setRecords(purchases.filter((record): record is CompanyRecord => Boolean(record)));
        setLoading(false);
      }
    };
    if (userSession.isActive()) void load();
    else setLoading(false);
    return () => { active = false; };
  }, []);

  const units = records.reduce((total, record) => total + record.purchase.quantity, 0);
  const batches = records.filter((record) => record.succeeded && record.purchase.batchId).length;
  const claimed = records.reduce((total, record) => total + record.purchase.claimed, 0);
  const pending = records.filter((record) => !record.purchase.batchId).length;
  const products = records.filter((record): record is Extract<PurchaseStatus, { succeeded: true }> => record.succeeded).flatMap((record) => (record.batch?.tokens ?? []).map((token) => ({
    ...token,
    model: record.purchase.model,
    lot: record.purchase.lot,
    destination: record.purchase.destination,
    createdAt: record.purchase.createdAt
  })));

  return (
    <>
      <section className="company-metrics" aria-label="Métricas reales de la empresa">
        <article className="company-metric"><span className="metric-icon metric-blue"><i className="fa-solid fa-cubes-stacked" /></span><div><small>Unidades registradas</small><strong>{units.toLocaleString('es-AR')}</strong><em>Según tus compras</em></div></article>
        <article className="company-metric"><span className="metric-icon metric-green"><i className="fa-solid fa-layer-group" /></span><div><small>Lotes generados</small><strong>{batches.toLocaleString('es-AR')}</strong><em>{pending ? `${pending} pendiente${pending === 1 ? '' : 's'} de pago` : 'Sin pagos pendientes'}</em></div></article>
        <article className="company-metric"><span className="metric-icon metric-amber"><i className="fa-solid fa-circle-check" /></span><div><small>Activaciones</small><strong>{claimed.toLocaleString('es-AR')}</strong><em>Productos con garantía</em></div></article>
        <article className="company-metric"><span className="metric-icon metric-red"><i className="fa-solid fa-wallet" /></span><div><small>Inversión registrada</small><strong>{records.reduce((total, record) => total + Number(record.purchase.amount), 0).toLocaleString('es-AR')} XLM</strong><em>{records.length} compra{records.length === 1 ? '' : 's'} registradas</em></div></article>
      </section>

      <section className="company-panel company-products company-real-products" id="products">
        <div className="company-panel-heading"><div><span className="company-eyebrow">Inventario real</span><h2>Productos de tu cuenta</h2></div><a href="/batches">Ver lotes <i className="fa-solid fa-arrow-right" /></a></div>
        {loading ? <p className="company-data-empty">Cargando los datos de tu cuenta...</p> : products.length === 0 ? <p className="company-data-empty">Todavía no hay productos asociados a esta cuenta. Genera tu primer lote para verlos aquí.</p> : <div className="company-table-wrap"><table className="company-table"><thead><tr><th>Producto</th><th>Modelo</th><th>Estado</th><th>Destino</th><th>Creado</th></tr></thead><tbody>{products.slice(0, 20).map((product) => <tr key={product.token}><td><strong>{product.token}</strong><small>Lote {product.lot}</small></td><td>{product.model}</td><td><span className={`status-pill ${product.status === 'CLAIMED_IN_WARRANTY' ? 'status-warning' : 'status-ok'}`}><i className="fa-solid fa-circle" />{product.status === 'CLAIMED_IN_WARRANTY' ? 'Activado' : 'Sellado'}</span></td><td>{product.destination}</td><td className="table-date">{formatDate(product.createdAt)}</td></tr>)}</tbody></table></div>}
      </section>
    </>
  );
}
