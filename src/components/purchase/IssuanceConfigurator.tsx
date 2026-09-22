import { storedUser } from '@/lib/client/account';
import { companyMemberships } from '@/lib/client/workspace';
import { useEffect, useState, type SubmitEvent } from 'react';
import type { CountryOption } from '@/lib/types';
import type { IssuanceOptions } from '@/lib/issuance';
interface Draft extends IssuanceOptions { model: string; lot: string; country: string; quantity: number; }
interface Saved { name: string; draft: Draft; }
const blank: Draft = { model: '', lot: '', country: '', quantity: 3, brand: '', labelText: '', labelStyle: 'standard' };
const steps = ['Producto', 'Lote y unidades', 'Etiquetas', 'Revisar'];
export function IssuanceConfigurator({ countries, submitting, onSubmit, pricePerToken }: { pricePerToken?: string | undefined; countries: CountryOption[]; submitting: boolean; onSubmit: (event: SubmitEvent<HTMLFormElement>) => void }) {
  const [draft, setDraft] = useState<Draft>(blank);
  const [step, setStep] = useState(0);
  const [companyName, setCompanyName] = useState('');
  const [saved, setSaved] = useState<Saved[]>([]);
  const [products, setProducts] = useState<Saved[]>([]);
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((old) => ({ ...old, [key]: value }));
  useEffect(() => {
    const user = storedUser();
    const company = user ? companyMemberships(user.email)[0]?.companyName || user.companyName || '' : '';
    setCompanyName(company);
    setDraft((old) => ({ ...old, brand: company }));
    try {
      const read = (key: string): Saved[] => {
        const data: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
        return Array.isArray(data) ? data.filter((entry): entry is Saved => entry && typeof entry.name === 'string' && entry.draft && Object.keys(blank).every((key) => typeof entry.draft[key] === typeof blank[key as keyof Draft])) : [];
      };
      setSaved(read('verifire-issuance-templates')); setProducts(read('verifire-issuance-products'));
    } catch { setNotice('No se pudieron leer las configuraciones guardadas.'); }
  }, []);
  const persist = (product: boolean) => {
    const title = (product ? draft.model : name).trim();
    if (!title) { setNotice(product ? 'Ingresá un modelo para guardar el producto.' : 'Ingresá un nombre para la plantilla.'); return; }
    const list = product ? products : saved;
    const next = [{ name: title, draft: { ...draft, lot: '' } }, ...list.filter((item) => item.name !== title)].slice(0, 50);
    try { localStorage.setItem(product ? 'verifire-issuance-products' : 'verifire-issuance-templates', JSON.stringify(next)); (product ? setProducts : setSaved)(next); setNotice('Guardado en este navegador.'); }
    catch { setNotice('No se pudo guardar la configuración.'); }
  };
  const validate = () => {
    if (!draft.model.trim() || draft.model.length > 120) { setStep(0); setNotice('Completá el modelo del producto.'); return false; }
    if (!draft.lot.trim() || draft.lot.length > 60 || !countries.some((item) => item.code === draft.country) || !Number.isInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > 500) { setStep(1); setNotice('Revisá la referencia, el destino y la cantidad (1–500).'); return false; }
    return true;
  };
  const field = (key: 'model' | 'brand' | 'lot' | 'labelText', label: string, maxLength = 80) => <label>{label}<input value={draft[key]} maxLength={maxLength} onChange={(event) => update(key, event.target.value)} /></label>;
  const destination = countries.find((item) => item.code === draft.country)?.name ?? 'Destino pendiente';
  return <form className="issuance-configurator" onSubmit={(event) => { if (step !== 3 || !validate()) { event.preventDefault(); return; } onSubmit(event); }}>
    <input type="hidden" name="model" value={draft.model} /><input type="hidden" name="lot" value={draft.lot} /><input type="hidden" name="country" value={draft.country} /><input type="hidden" name="quantity" value={draft.quantity} />
    <input type="hidden" name="configuration" value={JSON.stringify({ brand: draft.brand, labelText: draft.labelText, labelStyle: draft.labelStyle })} />
    <nav className="config-steps" aria-label="Pasos de emisión">{steps.map((label, index) => <button key={label} type="button" aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)}>{index + 1}. {label}</button>)}</nav>
    <label>Usar plantilla guardada<select defaultValue="" onChange={(event) => { const item = saved[Number(event.target.value)]; if (event.target.value !== '' && item) { setDraft({ ...item.draft, brand: companyName || item.draft.brand, lot: '' }); setStep(0); } }}><option value="">Seleccionar plantilla</option>{saved.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}</select></label>
    {step === 0 && <fieldset><legend>Identidad del producto</legend><label>Producto guardado<select defaultValue="" onChange={(event) => { const item = products[Number(event.target.value)]; if (event.target.value !== '' && item) setDraft((old) => ({ ...old, model: item.draft.model, brand: companyName || item.draft.brand })); }}><option value="">Nuevo producto</option>{products.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}</select></label>{field('model', 'Modelo del producto *', 120)}<label>Marca<input value={draft.brand} readOnly={Boolean(companyName)} maxLength={80} onChange={(event) => update('brand', event.target.value)} /><small className="field-hint">{companyName ? 'Se completa con el nombre de tu empresa.' : 'Completá el nombre de tu empresa para identificar las etiquetas.'}</small></label><button type="button" className="button button-secondary" onClick={() => persist(true)}>Guardar producto</button></fieldset>}
    {step === 1 && <fieldset><legend>Lote y unidades</legend>{field('lot', 'Referencia del lote *', 60)}<button type="button" className="button button-secondary" onClick={() => update('lot', `VF-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`)}>Asignar referencia automática</button><p className="field-hint">Podés editar la referencia. Los identificadores de cada token se asignan al emitir.</p><label>País de destino *<select value={draft.country} onChange={(event) => update('country', event.target.value)}><option value="">Elegí un país</option>{countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label>Cantidad de tokens *<input type="number" min={1} max={500} value={draft.quantity} onChange={(event) => update('quantity', Number(event.target.value))} /></label></fieldset>}
    {step === 2 && <fieldset><legend>Personalización de etiquetas</legend><label>Formato<select value={draft.labelStyle} onChange={(event) => update('labelStyle', event.target.value as Draft['labelStyle'])}><option value="standard">Estándar</option><option value="compact">Compacto</option></select></label>{field('labelText', 'Texto adicional en la etiqueta', 160)}<div className={`config-label-preview ${draft.labelStyle}`}><strong>{draft.brand || 'Tu marca'}</strong><span>{draft.model || 'Modelo'}</span><span>Lote {draft.lot || 'Pendiente'}</span><div className="config-qr-placeholders"><span>QR público</span><span>QR secreto · interior</span></div><small>{draft.labelText}</small><small>Vista previa de distribución. Los QR reales se generan después del pago.</small></div></fieldset>}
    {step === 3 && <fieldset><legend>Revisar emisión</legend><dl className="company-emission-values"><div><dt>Producto</dt><dd>{draft.brand} {draft.model}</dd></div><div><dt>Lote</dt><dd>{draft.lot || 'Pendiente'}</dd></div><div><dt>Destino</dt><dd>{destination}</dd></div><div><dt>Tokens</dt><dd>{draft.quantity}</dd></div><div><dt>Importe estimado</dt><dd>{pricePerToken ? `${(Number(pricePerToken) * draft.quantity).toFixed(2)} XLM` : 'Se calcula al continuar'}</dd></div><div><dt>Etiqueta</dt><dd>{draft.labelStyle === 'compact' ? 'Compacta' : 'Estándar'}</dd></div></dl><p className="field-hint">Al continuar se calcula el importe y se crea la solicitud de pago. No se debita automáticamente.</p><label>Guardar como plantilla<input maxLength={80} value={name} placeholder="Ej. Calzado Argentina" onChange={(event) => setName(event.target.value)} /></label><button type="button" className="button button-secondary" onClick={() => persist(false)}>Guardar plantilla</button><p className="field-hint">Productos y plantillas se guardan en este navegador. La configuración emitida se conserva con la compra.</p></fieldset>}
    {notice && <p role="status" className="field-hint">{notice}</p>}
    <div className="config-actions">{step > 0 && <button type="button" className="button button-secondary" onClick={() => setStep(step - 1)}>Anterior</button>}{step < 3 ? <button type="button" className="button button-primary" onClick={() => { if (step === 0 && !draft.model.trim()) { setNotice('Ingresá un modelo.'); return; } if (step === 1 && !validate()) return; setNotice(''); setStep(step + 1); }}>Siguiente</button> : <button type="submit" className="button button-primary" disabled={submitting}>{submitting ? 'Preparando pago…' : 'Confirmar y obtener pago'}</button>}</div>
  </form>;
}