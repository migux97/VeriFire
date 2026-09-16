import { useStore } from '@nanostores/react';
import { plural } from '@/lib/format';
import { $batchStats } from '@/stores/batches';

export function BatchStats() {
  const { batchCount, tokens, claimed, percent, topModel } = useStore($batchStats);

  return (
    <div className="stat-grid">
      <article className="stat-card">
        <span className="stat-label">Tokens activados por clientes</span>
        <strong className="stat-value">{tokens ? `${percent}%` : '—'}</strong>
        <div className="batch-progress-track"><span className="batch-progress-bar" style={{ width: `${percent}%` }} /></div>
        <span className="stat-detail">{tokens ? `${claimed} de ${tokens} ${plural(tokens, 'token activado', 'tokens activados')}` : 'Sin lotes todavía'}</span>
      </article>
      <article className="stat-card">
        <span className="stat-label">Producto más reclamado</span>
        <strong className="stat-value">{topModel?.model ?? '—'}</strong>
        <span className="stat-detail">
          {topModel
            ? `${topModel.claimed} de ${topModel.quantity} activados (${Math.round((topModel.claimed / topModel.quantity) * 100)}%)`
            : 'Sin activaciones todavía'}
        </span>
      </article>
      <article className="stat-card">
        <span className="stat-label">Lotes emitidos</span>
        <strong className="stat-value">{batchCount ? String(batchCount) : '—'}</strong>
        <span className="stat-detail">{batchCount ? `${tokens} ${plural(tokens, 'token emitido', 'tokens emitidos')}` : 'Sin lotes todavía'}</span>
      </article>
    </div>
  );
}
