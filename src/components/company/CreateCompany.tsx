import { useEffect, useState, type SubmitEvent } from 'react';
import { CompanyTextProvider, useCompanyText } from '@/components/company/CompanyText';
import { Icon } from '@/components/ui/Icon';
import { storedUser } from '@/lib/client/account';
import { createOwnCompany, forgetCompanyIntent, hasOwnCompany } from '@/lib/client/company-signup';
import { currentWorkspace } from '@/lib/client/workspace';
import type { Locale } from '@/lib/locale';

// The step after registering, for whoever runs a company: its trade name (and, if they want, its industry). Everything
// else of the profile is completed later in Configuración.
export function CreateCompany({ locale }: { locale?: Locale | undefined }) {
  return (
    <CompanyTextProvider locale={locale}>
      <Form />
    </CompanyTextProvider>
  );
}

function Form() {
  const t = useCompanyText();
  const text = t.createCompany;
  const industries = t.settings.profile.industries;
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [error, setError] = useState('');
  const [member, setMember] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const user = storedUser();
    // An account that already runs a company has nothing to create here.
    if (hasOwnCompany(user)) {
      forgetCompanyIntent();
      setBusy(true);
      setError(text.already);
      window.location.replace('/company');
      return;
    }
    setMember(currentWorkspace(user)?.companyName ?? '');
  }, []);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(text.needName);
      return;
    }
    setBusy(true);
    if (!createOwnCompany(trimmed, industry)) {
      setBusy(false);
      setError(text.saveFailed);
      return;
    }
    window.location.assign('/company');
  };

  return (
    <section className="create-company" aria-labelledby="create-company-title">
      <span className="create-company-mark" aria-hidden="true">
        <Icon name="fa-solid fa-building" />
      </span>
      <span className="company-eyebrow">{text.eyebrow}</span>
      <h1 id="create-company-title">{text.title}</h1>
      <p className="create-company-lead">{text.lead}</p>
      {member && <p className="create-company-note">{text.member.replace('{company}', member)}</p>}
      <form className="create-company-form" noValidate onSubmit={submit}>
        <label>
          <span>{text.name}</span>
          <input
            name="companyName"
            type="text"
            value={name}
            maxLength={80}
            placeholder={text.namePlaceholder}
            autoComplete="organization"
            required
            autoFocus
            disabled={busy}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <small>{text.nameHint}</small>
        </label>
        <label>
          <span>
            {text.industry} <em>{text.optional}</em>
          </span>
          <select value={industry} disabled={busy} onChange={(event) => setIndustry(event.currentTarget.value)}>
            {Object.entries(industries).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="create-company-error" role="alert">
            {error}
          </p>
        )}
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? text.creating : text.submit}
        </button>
        <a
          className="create-company-later"
          href="/app"
          onClick={() => forgetCompanyIntent()}
        >
          {text.later}
        </a>
      </form>
    </section>
  );
}
