import { useEffect, useState, type SubmitEvent } from 'react';

type ScheduleType = 'batch' | 'payment';

interface ScheduleItem {
  id: string;
  type: ScheduleType;
  title: string;
  detail: string;
  date: string;
}

const STORAGE_KEY = 'verifire-company-schedules';

const initialSchedules: ScheduleItem[] = [
  { id: 'sample-batch', type: 'batch', title: 'Lote Runner X · 120 unidades', detail: 'Destino: Argentina · Operaciones', date: '2026-09-24T09:00' },
  { id: 'sample-payment', type: 'payment', title: 'Pago de producción', detail: '350 XLM · Tesorería', date: '2026-09-27T11:30' }
];

const formatDate = (value: string) => new Intl.DateTimeFormat('es-AR', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
}).format(new Date(value));

export function CompanyOperations() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>(initialSchedules);
  const [type, setType] = useState<ScheduleType>('batch');
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSchedules(JSON.parse(saved) as ScheduleItem[]);
    } catch {
      // The panel can continue with the example schedule if storage is unavailable.
    }
  }, []);

  const save = (next: ScheduleItem[]) => {
    setSchedules(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const createSchedule = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const date = String(data.get('date') ?? '');
    const name = String(data.get('name') ?? '').trim();
    const amount = String(data.get('amount') ?? '').trim();
    if (!date || !name) {
      setNotice('Completa la operación y la fecha.');
      return;
    }
    const item: ScheduleItem = {
      id: crypto.randomUUID(),
      type,
      title: type === 'batch' ? `${name} · ${amount || 'Cantidad pendiente'} unidades` : name,
      detail: type === 'batch' ? 'Destino pendiente · Operaciones' : `${amount || 'Importe pendiente'} · Tesorería`,
      date
    };
    save([item, ...schedules]);
    setNotice(type === 'batch' ? 'Lote programado.' : 'Pago programado.');
    setOpen(false);
    event.currentTarget.reset();
  };

  const exportSchedules = () => {
    const rows = ['Tipo,Operación,Detalle,Fecha', ...schedules.map((item) => [item.type, item.title, item.detail, item.date].map((value) => `"${value.replaceAll('"', '""')}"`).join(','))];
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    link.download = 'verifire-operaciones.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="products-operations" id="operations" aria-labelledby="operations-title">
      <div className="company-panel-heading">
        <div><span className="company-eyebrow">Producción y tesorería</span><h2 id="operations-title">Acciones de producción</h2></div>
        <span className="operations-status"><i className="fa-solid fa-circle" /> Agenda local</span>
      </div>
      <div className="operations-actions">
        <a className="operation-action operation-action-primary" href="/admin"><i className="fa-solid fa-plus" /><span><strong>Generar lote</strong><small>Crear y pagar ahora</small></span><i className="fa-solid fa-arrow-right" /></a>
        <button className="operation-action" type="button" onClick={() => { setType('batch'); setOpen(true); }}><i className="fa-solid fa-calendar-plus" /><span><strong>Programar lote</strong><small>Definir fecha y cantidad</small></span><i className="fa-solid fa-chevron-right" /></button>
        <button className="operation-action" type="button" onClick={() => { setType('payment'); setOpen(true); }}><i className="fa-solid fa-coins" /><span><strong>Programar pago</strong><small>Planificar tesorería</small></span><i className="fa-solid fa-chevron-right" /></button>
        <button className="operation-action" type="button" onClick={exportSchedules}><i className="fa-solid fa-file-export" /><span><strong>Exportar agenda</strong><small>Descargar CSV</small></span><i className="fa-solid fa-download" /></button>
      </div>

      {open && (
        <form className="operations-form" onSubmit={createSchedule}>
          <div className="operations-form-heading"><strong>{type === 'batch' ? 'Programar nuevo lote' : 'Programar nuevo pago'}</strong><button type="button" aria-label="Cerrar formulario" onClick={() => setOpen(false)}><i className="fa-solid fa-xmark" /></button></div>
          <label><span>{type === 'batch' ? 'Modelo o referencia' : 'Concepto del pago'}</span><input name="name" placeholder={type === 'batch' ? 'Ej. Runner X · lote 1044' : 'Ej. Pago producción septiembre'} required /></label>
          <label><span>{type === 'batch' ? 'Cantidad de unidades' : 'Importe y moneda'}</span><input name="amount" placeholder={type === 'batch' ? '120' : '350 XLM'} /></label>
          <label><span>Fecha y hora</span><input name="date" type="datetime-local" required /></label>
          <div className="operations-form-actions"><button type="button" className="operations-cancel" onClick={() => setOpen(false)}>Cancelar</button><button type="submit" className="operations-submit"><i className="fa-solid fa-calendar-check" /> Guardar programación</button></div>
        </form>
      )}

      <div className="operations-schedule-heading"><span>Próximas operaciones</span><small>{schedules.length} programadas</small></div>
      <div className="operations-schedule">
        {schedules.slice(0, 4).map((item) => <div className="operations-item" key={item.id}><span className={`operations-item-icon ${item.type === 'payment' ? 'is-payment' : ''}`}><i className={`fa-solid ${item.type === 'payment' ? 'fa-coins' : 'fa-layer-group'}`} /></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><time dateTime={item.date}>{formatDate(item.date)}</time><span className="operations-item-status">Programado</span></div>)}
      </div>
      {notice && <p className="operations-notice" role="status">{notice}</p>}
    </div>
  );
}
