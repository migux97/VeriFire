import { useEffect, useState, type SubmitEvent } from 'react';
import { accountKey } from '@/lib/client/session';
import { readStored, writeStored } from '@/lib/client/storage';
type ScheduleType = 'batch' | 'payment';
interface ScheduleItem {
  id: string;
  type: ScheduleType;
  title: string;
  detail: string;
  date: string;
}
const storageKey = () => accountKey('company-schedules', 'verifire-company-schedules');
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export function CompanyOperations({ mode }: { mode?: ScheduleType }) {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [type, setType] = useState<ScheduleType>(mode ?? 'batch');
  const [open, setOpen] = useState(Boolean(mode));
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (mode) {
      setType(mode);
      setOpen(true);
      setNotice('');
    }
  }, [mode]);
  useEffect(() => {
    const load = () => {
      try {
        const saved: unknown = readStored<unknown>(localStorage, storageKey()) ?? [];
        if (Array.isArray(saved))
          setSchedules(
            saved.filter(
              (item): item is ScheduleItem =>
                item &&
                typeof item.id === 'string' &&
                !item.id.startsWith('sample-') &&
                (item.type === 'batch' || item.type === 'payment') &&
                typeof item.title === 'string' &&
                typeof item.detail === 'string' &&
                typeof item.date === 'string' &&
                Number.isFinite(Date.parse(item.date))
            )
          );
      } catch {
        setNotice('No se pudo leer la agenda de este navegador.');
      }
    };
    load();
    window.addEventListener('company-schedules-changed', load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener('company-schedules-changed', load);
      window.removeEventListener('storage', load);
    };
  }, []);
  const save = (next: ScheduleItem[]) => {
    try {
      if (!writeStored(localStorage, storageKey(), next)) throw new Error('storage');
      setSchedules(next);
      window.dispatchEvent(new Event('company-schedules-changed'));
      return true;
    } catch {
      setNotice('No se pudo guardar. Revisá el almacenamiento del navegador.');
      return false;
    }
  };
  const createSchedule = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const amount = Number(data.get('amount'));
    const date = String(data.get('date') ?? '');
    const reference = String(data.get('reference') ?? '').trim();
    if (
      !name ||
      !Number.isFinite(Date.parse(date)) ||
      Date.parse(date) <= Date.now() ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      (type === 'batch' && (!Number.isInteger(amount) || amount > 500))
    ) {
      setNotice('Revisá el nombre, la fecha futura y la cantidad: de 1 a 500 tokens o un importe mayor a cero.');
      return;
    }
    const item: ScheduleItem = {
      id: crypto.randomUUID(),
      type,
      title: type === 'batch' ? `${name} · ${amount} unidades` : name,
      detail:
        type === 'batch'
          ? `Referencia: ${reference || 'Pendiente'} · Destino: ${String(data.get('destination') ?? '').trim() || 'Pendiente'}`
          : `${amount} XLM · ${reference || 'Tesorería'}`,
      date
    };
    if (!save([item, ...schedules])) return;
    form.reset();
    setOpen(Boolean(mode));
    setNotice('Programación guardada en la agenda.');
  };
  const exportSchedules = () => {
    const csv = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
    const rows = ['Tipo,Operación,Detalle,Fecha', ...schedules.map((item) => [item.type, item.title, item.detail, item.date].map(csv).join(','))];
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    link.download = 'verifire-operaciones.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const items = [...schedules].filter((item) => !mode || item.type === mode).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return (
    <section className={`products-operations ${mode ? 'operations-embedded' : ''}`}>
      <div className="company-panel-heading">
        <div>
          <span className="company-eyebrow">Producción y tesorería</span>
          <h2>{mode === 'batch' ? 'Programar lote' : mode === 'payment' ? 'Programar pago' : 'Operaciones'}</h2>
        </div>
        <span className="operations-status">Agenda local</span>
      </div>
      <p className="schedule-disclaimer">Recordatorios guardados en este navegador. La programación no ejecuta pagos ni genera tokens automáticamente.</p>
      {!mode && (
        <div className="operations-actions">
          <a className="operation-action operation-action-primary" href="#generate">
            Generar tokens
          </a>
          <button
            className="operation-action"
            type="button"
            onClick={() => {
              setType('batch');
              setOpen(true);
            }}
          >
            Programar lote
          </button>
          <button
            className="operation-action"
            type="button"
            onClick={() => {
              setType('payment');
              setOpen(true);
            }}
          >
            Programar pago
          </button>
        </div>
      )}
      {open && (
        <form key={type} className="operations-form" onSubmit={createSchedule}>
          <label>
            <span>{type === 'batch' ? 'Modelo del producto' : 'Concepto del pago'}</span>
            <input name="name" maxLength={120} placeholder={type === 'batch' ? 'Ej. Zapatilla Runner X' : 'Ej. Pago de producción'} required />
          </label>
          <label>
            <span>{type === 'batch' ? 'Referencia del lote' : 'Referencia o destinatario'}</span>
            <input name="reference" maxLength={120} placeholder={type === 'batch' ? 'Ej. 1043' : 'Ej. Proveedor / factura'} />
          </label>
          {type === 'batch' && (
            <label>
              <span>Destino</span>
              <input name="destination" maxLength={120} placeholder="Ej. Argentina" required />
            </label>
          )}
          <label>
            <span>{type === 'batch' ? 'Cantidad de tokens' : 'Importe en XLM'}</span>
            <input
              name="amount"
              type="number"
              min={type === 'batch' ? 1 : 0.0000001}
              max={type === 'batch' ? 500 : undefined}
              step={type === 'batch' ? 1 : '0.0000001'}
              placeholder={type === 'batch' ? '120' : '350'}
              required
            />
          </label>
          <label>
            <span>Fecha y hora local</span>
            <input name="date" type="datetime-local" required />
          </label>
          <div className="operations-form-actions">
            {!mode && (
              <button type="button" className="operations-cancel" onClick={() => setOpen(false)}>
                Cancelar
              </button>
            )}
            <button type="submit" className="operations-submit">
              Guardar programación
            </button>
          </div>
        </form>
      )}
      {notice && (
        <p className="operations-notice" role="status">
          {notice}
        </p>
      )}
      <div className="operations-schedule-heading">
        <span>Agenda · {items.length} operaciones</span>
        <button type="button" className="operations-cancel" disabled={!schedules.length} onClick={exportSchedules}>
          Exportar CSV
        </button>
      </div>
      {!items.length && (
        <p className="company-data-empty">Todavía no hay operaciones programadas{mode === 'batch' ? ' de lotes' : mode === 'payment' ? ' de pagos' : ''}.</p>
      )}
      <div className="operations-schedule">
        {items.map((item) => (
          <div className="operations-item" key={item.id}>
            <span className="operations-item-icon">
              <i className={`fa-solid ${item.type === 'batch' ? 'fa-layer-group' : 'fa-coins'}`} />
            </span>
            <span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
            <time dateTime={item.date}>{formatDate(item.date)}</time>
            <button
              type="button"
              className="operations-cancel"
              onClick={() => {
                if (save(schedules.filter((entry) => entry.id !== item.id))) setNotice('Programación eliminada.');
              }}
              aria-label={`Eliminar programación: ${item.title}`}
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
