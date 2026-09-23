import { ACCOUNT_DATA_EVENT } from '@/lib/client/account-data';
import { useEffect, useState, type SubmitEvent } from 'react';
import { relativeTime } from '@/i18n/company';
import { downloadBlob } from '@/lib/client/download';
import { readSchedules, SCHEDULES_CHANGED_EVENT, writeSchedules, type ScheduleItem, type ScheduleType } from '@/lib/client/schedules';
import type { Locale } from '@/lib/locale';
import { CompanyTextProvider, useCompanyText } from './CompanyText';

export function CompanyOperations({ mode, locale }: { mode?: ScheduleType; locale?: Locale | undefined }) {
  return (
    <CompanyTextProvider locale={locale}>
      <Operations mode={mode} />
    </CompanyTextProvider>
  );
}

export function Operations({ mode }: { mode?: ScheduleType | undefined }) {
  const t = useCompanyText();
  const text = t.operations;
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [type, setType] = useState<ScheduleType>(mode ?? 'batch');
  const [open, setOpen] = useState(Boolean(mode));
  const [notice, setNotice] = useState('');
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(t.intl, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

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
        setSchedules(readSchedules());
      } catch {
        setNotice(text.readFailed);
      }
    };
    load();
    window.addEventListener(SCHEDULES_CHANGED_EVENT, load);
    window.addEventListener(ACCOUNT_DATA_EVENT, load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener(SCHEDULES_CHANGED_EVENT, load);
      window.removeEventListener(ACCOUNT_DATA_EVENT, load);
      window.removeEventListener('storage', load);
    };
  }, []);
  const save = (next: ScheduleItem[]) => {
    if (!writeSchedules(next)) {
      setNotice(text.saveFailed);
      return false;
    }
    setSchedules(next);
    return true;
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
      setNotice(text.invalid);
      return;
    }
    const item: ScheduleItem = {
      id: crypto.randomUUID(),
      type,
      title: type === 'batch' ? text.batchTitleValue(name, amount) : name,
      detail: type === 'batch' ? text.batchDetail(reference, String(data.get('destination') ?? '').trim()) : text.paymentDetail(amount, reference),
      date
    };
    if (!save([item, ...schedules])) return;
    form.reset();
    setOpen(Boolean(mode));
    setNotice(text.saved);
  };
  const exportSchedules = () => {
    const csv = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
    const rows = [text.csvHeader, ...schedules.map((item) => [item.type, item.title, item.detail, item.date].map(csv).join(','))];
    downloadBlob(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }), text.csvFile);
  };
  const items = [...schedules].filter((item) => !mode || item.type === mode).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const f = text.fields;
  return (
    <section className={`company-card products-operations ${mode ? 'operations-embedded' : ''}`}>
      <div className="company-card-heading">
        <div>
          <span className="company-eyebrow">{text.eyebrow}</span>
          <h2>{mode === 'batch' ? text.batchTitle : mode === 'payment' ? text.paymentTitle : text.title}</h2>
        </div>
        <span className="company-badge">
          <i className="fa-solid fa-bell" aria-hidden="true" /> {text.badge}
        </span>
      </div>
      <p className="schedule-disclaimer">{text.disclaimer}</p>
      {!mode && (
        <div className="operations-actions">
          <a className="operation-action operation-action-primary" href="#generate">
            <i className="fa-solid fa-bolt" aria-hidden="true" /> {text.generate}
          </a>
          <button
            className="operation-action"
            type="button"
            onClick={() => {
              setType('batch');
              setOpen(true);
            }}
          >
            <i className="fa-solid fa-calendar-plus" aria-hidden="true" /> {text.scheduleBatch}
          </button>
          <button
            className="operation-action"
            type="button"
            onClick={() => {
              setType('payment');
              setOpen(true);
            }}
          >
            <i className="fa-solid fa-coins" aria-hidden="true" /> {text.schedulePayment}
          </button>
        </div>
      )}
      {open && (
        <form key={type} className="operations-form" onSubmit={createSchedule}>
          <label>
            <span>{type === 'batch' ? f.batchName : f.paymentName}</span>
            <input name="name" maxLength={120} placeholder={type === 'batch' ? f.batchNamePlaceholder : f.paymentNamePlaceholder} required />
          </label>
          <label>
            <span>{type === 'batch' ? f.batchReference : f.paymentReference}</span>
            <input name="reference" maxLength={120} placeholder={type === 'batch' ? f.batchReferencePlaceholder : f.paymentReferencePlaceholder} />
          </label>
          {type === 'batch' && (
            <label>
              <span>{f.destination}</span>
              <input name="destination" maxLength={120} placeholder={f.destinationPlaceholder} required />
            </label>
          )}
          <label>
            <span>{type === 'batch' ? f.tokens : f.amount}</span>
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
            <span>{f.date}</span>
            <input name="date" type="datetime-local" required />
          </label>
          <div className="operations-form-actions">
            {!mode && (
              <button type="button" className="company-button is-ghost" onClick={() => setOpen(false)}>
                {t.common.cancel}
              </button>
            )}
            <button type="submit" className="company-button is-primary">
              <i className="fa-solid fa-check" aria-hidden="true" /> {text.save}
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
        <span>{text.agenda(items.length)}</span>
        <button type="button" className="company-button is-ghost is-small" disabled={!schedules.length} onClick={exportSchedules}>
          <i className="fa-solid fa-file-csv" aria-hidden="true" /> {text.export}
        </button>
      </div>
      {!items.length && <p className="company-data-empty">{text.empty(mode)}</p>}
      <ul className="operations-schedule">
        {items.map((item) => {
          const overdue = Date.parse(item.date) <= Date.now();
          return (
            <li className={`operations-item ${overdue ? 'is-overdue' : ''}`} key={item.id}>
              <span className={`operations-item-icon is-${item.type}`} aria-hidden="true">
                <i className={`fa-solid ${item.type === 'batch' ? 'fa-layer-group' : 'fa-coins'}`} />
              </span>
              <span className="operations-item-text">
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
              <time dateTime={item.date}>
                {formatDate(item.date)}
                <small>{overdue ? text.overdue : relativeTime(new Date(Date.parse(item.date)).toISOString(), t.intl)}</small>
              </time>
              <button
                type="button"
                className="company-icon-button is-small"
                onClick={() => {
                  if (save(schedules.filter((entry) => entry.id !== item.id))) setNotice(text.removed);
                }}
                aria-label={text.removeLabel(item.title)}
              >
                <i className="fa-solid fa-trash-can" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
