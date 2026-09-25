// The list of companies a Verifire administrator reviews: what each one declared, what it did, and the decision. It only
// draws and reports the decision; signing and sending live in VerificationAdmin.tsx. Spanish only, like the rest of the
// internal tools.
import { useState } from 'react';
import type { CompanyForReview } from '@/lib/types';

export interface Decision {
  approve: (company: CompanyForReview, decision: { name: string; domain: string }) => Promise<void>;
  reject: (company: CompanyForReview, note: string) => Promise<void>;
}

const STATUS = { pending: 'En revisión', verified: 'Verificada', none: 'Sin pedir', rejected: 'Rechazada' } as const;

// "https://www.andesaudio.com/quienes" → "andesaudio.com".
const hostOf = (website: string) => website.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0] ?? '';

const date = (iso?: string) => (iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) : '');

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? 'is-mono' : ''}>{value || <em>—</em>}</dd>
    </div>
  );
}

function Review({ company, decision }: { company: CompanyForReview; decision: Decision }) {
  const { verification: state, profile } = company;
  const [name, setName] = useState(state.name ?? company.brandName ?? company.companyName);
  const [domain, setDomain] = useState(state.domain ?? hostOf(profile.website));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const approve = () => run(() => decision.approve(company, { name: name.trim(), domain: domain.trim() }));
  const reject = () => {
    if (!note.trim()) {
      setError('Escribí el motivo: la empresa lo lee para corregirlo.');
      return Promise.resolve();
    }
    return run(() => decision.reject(company, note.trim()));
  };

  return (
    <div className="vadmin-review">
      <div className="vadmin-fields">
        <label>
          <span>Nombre comercial que verificaste</span>
          <input value={name} maxLength={100} onChange={(event) => setName(event.currentTarget.value)} />
        </label>
        <label>
          <span>Sitio confirmado <small>(opcional)</small></span>
          <input value={domain} maxLength={200} placeholder="andesaudio.com" onChange={(event) => setDomain(event.currentTarget.value)} />
        </label>
      </div>
      <label>
        <span>Motivo <small>(solo si rechazás o quitás la verificación; la empresa lo lee)</small></span>
        <textarea value={note} maxLength={300} rows={2} placeholder="Ej. El CUIT no coincide con la razón social." onChange={(event) => setNote(event.currentTarget.value)} />
      </label>
      {error && <p className="vadmin-error" role="alert">{error}</p>}
      <div className="vadmin-actions">
        <button type="button" className="button button-primary" disabled={busy || !name.trim()} onClick={() => void approve()}>
          <i className="fa-solid fa-circle-check" aria-hidden="true" /> {state.status === 'verified' ? 'Actualizar verificación' : 'Aprobar'}
        </button>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => void reject()}>
          <i className="fa-solid fa-circle-xmark" aria-hidden="true" /> {state.status === 'verified' ? 'Quitar verificación' : 'Rechazar'}
        </button>
      </div>
    </div>
  );
}

export function VerificationList({ companies, decision }: { companies: CompanyForReview[]; decision: Decision }) {
  const waiting = companies.filter((company) => company.verification.status === 'pending').length;
  const [filter, setFilter] = useState<'pending' | 'all'>(waiting ? 'pending' : 'all');
  const [open, setOpen] = useState<string | null>(null);
  const shown = filter === 'pending' ? companies.filter((company) => company.verification.status === 'pending') : companies;

  return (
    <div className="vadmin">
      <div className="vadmin-filters" role="tablist" aria-label="Filtrar empresas">
        <button type="button" role="tab" aria-selected={filter === 'pending'} className={filter === 'pending' ? 'is-current' : ''} onClick={() => setFilter('pending')}>
          En revisión <span>{waiting}</span>
        </button>
        <button type="button" role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-current' : ''} onClick={() => setFilter('all')}>
          Todas <span>{companies.length}</span>
        </button>
      </div>

      {shown.length === 0 && <p className="vadmin-empty">{filter === 'pending' ? 'No hay empresas esperando revisión.' : 'Todavía no hay empresas.'}</p>}

      {shown.map((company) => {
        const { verification: state, profile, stats } = company;
        const expanded = open === company.owner || (open === null && shown.length === 1);
        return (
          <article key={company.owner} className={`vadmin-card is-${state.status}${state.status === 'verified' && !state.active ? ' is-paused' : ''}`}>
            <header>
              <div>
                <h3>{company.companyName || 'Sin nombre'}</h3>
                <small>{stats.batches} {stats.batches === 1 ? 'lote' : 'lotes'} · {stats.products} productos · {stats.claimed} activados</small>
              </div>
              <span className={`verify-status is-${state.status === 'verified' && !state.active ? 'paused' : state.status}`}>
                {state.status === 'verified' && !state.active ? 'Pausada (cambió el nombre)' : STATUS[state.status]}
              </span>
            </header>

            {state.message && (
              <blockquote>
                <strong>La empresa escribió:</strong> {state.message}
                {state.requestedAt && <small>Pedida el {date(state.requestedAt)}</small>}
              </blockquote>
            )}

            <dl className="vadmin-data">
              <Row label="Marca publicada" value={company.brandName ?? ''} />
              <Row label="Razón social" value={profile.legalName} />
              <Row label="CUIT / ID fiscal" value={profile.taxId} mono />
              <Row label="Sitio web" value={profile.website} />
              <Row label="Correo de contacto" value={profile.email} />
              <Row label="Teléfono" value={profile.phone} />
              <Row label="País" value={profile.country} />
              <Row label="Dirección" value={profile.address} />
              <Row label="Rubro" value={profile.industry} />
              <Row label="Billetera" value={company.owner} mono />
            </dl>

            {state.status === 'verified' && (
              <p className="vadmin-checked">
                Verificada como <strong>{state.name}</strong>{state.domain && <> · {state.domain}</>}{state.decidedAt && <> · {date(state.decidedAt)}</>}
              </p>
            )}
            {state.status === 'rejected' && state.note && <p className="vadmin-checked is-rejected">Rechazada: {state.note}</p>}

            <button type="button" className="vadmin-toggle" aria-expanded={expanded} onClick={() => setOpen(expanded ? '' : company.owner)}>
              <i className={`fa-solid ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true" /> {expanded ? 'Ocultar la decisión' : 'Decidir'}
            </button>
            {expanded && <Review company={company} decision={decision} />}
          </article>
        );
      })}
    </div>
  );
}
