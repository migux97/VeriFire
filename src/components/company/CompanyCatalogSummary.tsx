import { useStore } from '@nanostores/react';
import { $purchaseIds, $summaries, isSummary } from '@/stores/batches';
import type { PurchaseSummary } from '@/lib/types';
import { formatNumber as number } from '@/lib/format';
export function CompanyCatalogSummary() {
  const ids = useStore($purchaseIds);
  const summaries = useStore($summaries);
  const records = ids.map((id) => summaries[id]).filter((entry): entry is PurchaseSummary => isSummary(entry));
  const incomplete = records.length !== ids.length;
  const issued = records.filter((record) => record.batchId);
  const units = issued.reduce((sum, record) => sum + record.quantity, 0);
  const claimed = issued.reduce((sum, record) => sum + record.claimed, 0);
  const pending = records.filter((record) => !record.batchId);
  const recent = [...issued].sort((a, b) => (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0)).slice(0, 5);
  return <>
    {incomplete && <p className="company-data-empty" role="status">Algunos datos todavía no están disponibles. El resumen muestra las compras cargadas.</p>}
    <section className="company-metrics" aria-label="Resumen de lotes">
      {[['Lotes generados', number(issued.length)], ['Tokens en lotes', number(units)], ['Tokens activados', number(claimed)], ['Porcentaje activado', units ? `${number(claimed / units * 100)}%` : '—']].map(([label, value]) => <article className="company-metric" key={label}><div><small>{label}</small><strong>{value}</strong></div></article>)}
    </section>
    <div className="company-emission-summary">
      <section className="company-real-products"><h2>Estado de emisión</h2><dl className="company-emission-values">
        <div><dt>Compras sin lote generado</dt><dd>{number(pending.length)}</dd></div>
        <div><dt>Tokens solicitados sin lote</dt><dd>{number(pending.reduce((sum, record) => sum + record.quantity, 0))}</dd></div>
        <div><dt>Importe de compras sin lote</dt><dd>{number(pending.reduce((sum, record) => sum + Number(record.amount), 0))} XLM</dd></div>
        <div><dt>Inversión en lotes generados</dt><dd>{number(issued.reduce((sum, record) => sum + Number(record.amount), 0))} XLM</dd></div>
        <div><dt>Tokens registrados en cadena</dt><dd>{number(records.reduce((sum, record) => sum + record.registeredOnChain, 0))}</dd></div>
        <div><dt>Tokens pendientes en cadena</dt><dd>{number(records.reduce((sum, record) => sum + record.pendingOnChain, 0))}</dd></div>
      </dl></section>
      <section className="company-real-products"><h2>Últimos lotes generados</h2>
        {!recent.length ? <p className="company-data-empty">Todavía no hay lotes generados disponibles.</p> : <div className="company-table-wrap"><table className="company-table"><thead><tr><th>Lote / modelo</th><th>Destino</th><th>Tokens</th><th>Activados</th><th>Fecha de compra</th></tr></thead><tbody>{recent.map((record) => <tr key={record.purchaseId}><td><strong>{record.lot}</strong><small>{record.model}</small></td><td>{record.destination}</td><td>{number(record.quantity)}</td><td>{number(record.claimed)}</td><td>{record.createdAt ? new Date(record.createdAt).toLocaleDateString('es-AR') : '—'}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  </>;
}