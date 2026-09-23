import type { CSSProperties } from 'react';
import type { PurchaseStatus } from '@/lib/types';
import { formatNumber } from '@/lib/format';

const number = (value: number) => formatNumber(value, 1);
const percentage = (value: number, total: number) => total > 0 ? Math.min(100, Math.max(0, value / total * 100)) : 0;

export function CompanyOverview({ records, loading }: { records: PurchaseStatus[]; loading: boolean }) {
  if (loading) return <p className="company-data-empty" role="status">Cargando el resumen de tu cuenta…</p>;
  if (!records.length) return <section className="company-real-products"><h2>Tu actividad, en un solo lugar</h2><p className="company-data-empty">Todavía no hay compras disponibles. Cuando generes un lote, aquí verás sus indicadores y porcentajes.</p></section>;
  const issued = records.filter((record) => record.succeeded && record.purchase.batchId);
  const units = issued.reduce((sum, record) => sum + record.purchase.quantity, 0);
  const claimed = issued.reduce((sum, record) => sum + record.purchase.claimed, 0);
  const pending = records.length - issued.length;
  const activation = percentage(claimed, units);
  const investment = issued.reduce((sum, record) => sum + Number(record.purchase.amount), 0);
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const count = issued.filter(({ purchase }) => {
      if (!purchase.createdAt) return false;
      const created = new Date(purchase.createdAt);
      return created.getFullYear() === date.getFullYear() && created.getMonth() === date.getMonth();
    }).reduce((sum, { purchase }) => sum + purchase.quantity, 0);
    return { label: date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }), count };
  });
  const max = Math.max(1, ...months.map((month) => month.count));
  const metrics = [
    { label: 'Unidades en lotes generados', value: number(units), detail: `${issued.length} lotes generados`, icon: 'cubes-stacked', color: 'blue' },
    { label: 'Productos activados', value: number(claimed), detail: `${number(activation)}% de las unidades`, icon: 'circle-check', color: 'green' },
    { label: 'Compras pendientes', value: number(pending), detail: `${number(percentage(pending, records.length))}% de las compras`, icon: 'clock', color: 'amber' },
    { label: 'Inversión en lotes generados', value: `${number(investment)} XLM`, detail: 'Según compras completadas', icon: 'wallet', color: 'red' },
  ];
  return <div className="company-overview">
    <section className="company-metrics" aria-label="Indicadores de la cuenta">
      {metrics.map((metric) => <article className="company-metric" key={metric.label}><span className={`metric-icon metric-${metric.color}`}><i className={`fa-solid fa-${metric.icon}`} aria-hidden="true" /></span><div><small>{metric.label}</small><strong>{metric.value}</strong><em>{metric.detail}</em></div></article>)}
    </section>
    <div className="company-overview-grid">
      <section className="company-real-products"><span className="company-eyebrow">Últimos seis meses</span><h2>Unidades por mes de compra</h2><p className="company-chart-caption">Compras que ya tienen un lote generado.</p>
        <div className="company-bars" role="img" aria-label={months.map((month) => `${month.label}: ${month.count} unidades`).join('; ')}>
          {months.map((month) => <div className="company-bar-column" key={month.label}><strong>{number(month.count)}</strong><div className="company-bar-track"><div className="company-bar" style={{ height: `${month.count / max * 100}%` }} /></div><span>{month.label}</span></div>)}
        </div>
      </section>
      <section className="company-real-products"><span className="company-eyebrow">Garantías</span><h2>Porcentaje de activación</h2>
        <div className="company-donut" style={{ '--activation': `${activation}%` } as CSSProperties} role="img" aria-label={`${number(activation)}% de unidades activadas`}><div><strong>{number(activation)}%</strong><span>activado</span></div></div>
        <dl className="company-chart-legend"><div><dt>Activadas</dt><dd>{number(claimed)}</dd></div><div><dt>Sin activar</dt><dd>{number(Math.max(0, units - claimed))}</dd></div></dl>
      </section>
      <section className="company-real-products company-overview-status"><span className="company-eyebrow">Estado de las compras</span><h2>Distribución operativa</h2>
        {[{ label: 'Con lote generado', count: issued.length }, { label: 'Pendientes de generación', count: pending }].map((item) => <div className="company-progress-row" key={item.label}><div><span>{item.label}</span><strong>{item.count} · {number(percentage(item.count, records.length))}%</strong></div><progress max={records.length} value={item.count} aria-label={item.label} /></div>)}
      </section>
    </div>
    <section className="company-real-products">
      <span className="company-eyebrow">Detalle informativo</span><h2>Compras y activaciones por lote</h2>
      <div className="company-table-wrap"><table className="company-table">
        <caption className="company-chart-caption">Las unidades y la inversión del resumen incluyen únicamente compras con lote generado.</caption>
        <thead><tr><th scope="col">Lote / producto</th><th scope="col">Estado</th><th scope="col">Unidades</th><th scope="col">Activadas</th><th scope="col">Activación</th><th scope="col">Importe</th></tr></thead>
        <tbody>{records.map(({ purchase, succeeded }) => <tr key={purchase.purchaseId}>
          <td><strong>{purchase.lot}</strong><small>{purchase.model}</small></td>
          <td>{succeeded && purchase.batchId ? 'Generado' : 'Pendiente'}</td>
          <td>{number(purchase.quantity)}</td><td>{number(purchase.claimed)}</td>
          <td>{succeeded && purchase.batchId ? `${number(percentage(purchase.claimed, purchase.quantity))}%` : '—'}</td>
          <td>{number(Number(purchase.amount))} XLM</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}