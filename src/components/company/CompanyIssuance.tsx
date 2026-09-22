import { useState } from 'react';
import { PurchaseForm } from '@/components/purchase/PurchaseForm';
import { CompanyOperations } from './CompanyOperations';
import type { CountryOption } from '@/lib/types';
const modes = [
  { id: 'now', title: 'Emitir ahora', detail: 'Crear el lote y continuar al pago', icon: 'fa-bolt' },
  { id: 'batch', title: 'Programar lote', detail: 'Organizar la próxima producción', icon: 'fa-calendar-plus' },
  { id: 'payment', title: 'Programar pago', detail: 'Agendar un importe y vencimiento', icon: 'fa-coins' },
] as const;
export function CompanyIssuance({ countries, pricePerToken }: { countries: CountryOption[]; pricePerToken: string }) {
  const [mode, setMode] = useState<'now' | 'batch' | 'payment'>('now');
  return <div className="company-issuance">
    <header className="issuance-heading"><span className="company-eyebrow">Producción y pagos</span><h2>Planificá tu próxima emisión</h2><p>Emití tokens ahora o prepará la agenda de lotes y pagos desde este espacio.</p></header>
    <div className="issuance-modes" role="group" aria-label="Tipo de operación">{modes.map((item) => <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => setMode(item.id)}><i className={`fa-solid ${item.icon}`} aria-hidden="true" /><span><strong>{item.title}</strong><small>{item.detail}</small></span></button>)}</div>
    <div hidden={mode !== 'now'} className="issuance-immediate">
      <article className="company-real-products company-generation-form"><div className="issuance-section-title"><span>01</span><div><h2>Datos del lote</h2><p>Un producto, una referencia y un destino por emisión.</p></div></div><PurchaseForm pricePerToken={pricePerToken} countries={countries} batchesHref="#batches" embedded /></article>
      <aside className="company-real-products issuance-payment-info"><span className="company-eyebrow">Emisión inmediata</span><h3>Pago y disponibilidad</h3><dl><div><dt>Cantidad permitida</dt><dd>1–500 tokens</dd></div><div><dt>Moneda</dt><dd>XLM</dd></div><div><dt>Medio de pago</dt><dd>Cosmos Pay</dd></div></dl><p>El importe exacto y el QR aparecen al continuar. El lote se genera después de confirmar el pago.</p><p>Podés consultar el estado del pago y descargar las etiquetas desde Mis lotes.</p></aside>
    </div>
    <div hidden={mode === 'now'}><CompanyOperations mode={mode === 'payment' ? 'payment' : 'batch'} /></div>
  </div>;
}