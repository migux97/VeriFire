import { useCompanyText } from '@/components/company/CompanyText';
import { storedUser } from '@/lib/client/account';
import { companyMemberships } from '@/lib/client/workspace';
import { useEffect, useState, type SubmitEvent } from 'react';
import type { CountryOption } from '@/lib/types';
import type { IssuanceOptions } from '@/lib/issuance';
import { readAccountData, writeAccountData } from '@/lib/client/account-data';

const savedTemplates = () => readAccountData<unknown>('issuance-templates', 'verifire-issuance-templates');
const savedProducts = () => readAccountData<unknown>('issuance-products', 'verifire-issuance-products');
interface Draft extends IssuanceOptions {
  model: string;
  lot: string;
  country: string;
  quantity: number;
}
interface Saved {
  name: string;
  draft: Draft;
}
const blank: Draft = { model: '', lot: '', country: '', quantity: 3, brand: '', labelText: '', labelStyle: 'standard' };
export function IssuanceConfigurator({
  countries,
  submitting,
  onSubmit,
  pricePerToken
}: {
  pricePerToken?: string | undefined;
  countries: CountryOption[];
  submitting: boolean;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}) {
  const t = useCompanyText().configurator;
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
      const read = (data: unknown): Saved[] => {
        return Array.isArray(data)
          ? data.filter(
              (entry): entry is Saved =>
                entry &&
                typeof entry.name === 'string' &&
                entry.draft &&
                Object.keys(blank).every((key) => typeof entry.draft[key] === typeof blank[key as keyof Draft])
            )
          : [];
      };
      setSaved(read(savedTemplates() ?? []));
      setProducts(read(savedProducts() ?? []));
    } catch {
      setNotice(t.readFailed);
    }
  }, []);
  const persist = (product: boolean) => {
    const title = (product ? draft.model : name).trim();
    if (!title) {
      setNotice(product ? t.needModelToSave : t.needTemplateName);
      return;
    }
    const list = product ? products : saved;
    const next = [{ name: title, draft: { ...draft, lot: '' } }, ...list.filter((item) => item.name !== title)].slice(0, 50);
    try {
      if (!writeAccountData(product ? 'issuance-products' : 'issuance-templates', next)) throw new Error('storage');
      (product ? setProducts : setSaved)(next);
      setNotice(t.saved);
    } catch {
      setNotice(t.saveFailed);
    }
  };
  const validate = () => {
    if (!draft.model.trim() || draft.model.length > 120) {
      setStep(0);
      setNotice(t.needModel);
      return false;
    }
    if (
      !draft.lot.trim() ||
      draft.lot.length > 60 ||
      !countries.some((item) => item.code === draft.country) ||
      !Number.isInteger(draft.quantity) ||
      draft.quantity < 1 ||
      draft.quantity > 500
    ) {
      setStep(1);
      setNotice(t.checkLot);
      return false;
    }
    return true;
  };
  const field = (key: 'model' | 'brand' | 'lot' | 'labelText', label: string, maxLength = 80) => (
    <label>
      {label}
      <input value={draft[key]} maxLength={maxLength} onChange={(event) => update(key, event.target.value)} />
    </label>
  );
  const destination = countries.find((item) => item.code === draft.country)?.name ?? t.destinationPending;
  return (
    <form
      className="issuance-configurator"
      onSubmit={(event) => {
        if (step !== 3 || !validate()) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
    >
      <input type="hidden" name="model" value={draft.model} />
      <input type="hidden" name="lot" value={draft.lot} />
      <input type="hidden" name="country" value={draft.country} />
      <input type="hidden" name="quantity" value={draft.quantity} />
      <input type="hidden" name="configuration" value={JSON.stringify({ brand: draft.brand, labelText: draft.labelText, labelStyle: draft.labelStyle })} />
      <nav className="config-steps" aria-label={t.stepsLabel}>
        {t.steps.map((label, index) => (
          <button key={label} type="button" aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)}>
            {index + 1}. {label}
          </button>
        ))}
      </nav>
      <label>
        {t.template}
        <select
          defaultValue=""
          onChange={(event) => {
            const item = saved[Number(event.target.value)];
            if (event.target.value !== '' && item) {
              setDraft({ ...item.draft, brand: companyName || item.draft.brand, lot: '' });
              setStep(0);
            }
          }}
        >
          <option value="">{t.templatePick}</option>
          {saved.map((item, index) => (
            <option key={item.name} value={index}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {step === 0 && (
        <fieldset>
          <legend>{t.productLegend}</legend>
          <label>
            {t.savedProduct}
            <select
              defaultValue=""
              onChange={(event) => {
                const item = products[Number(event.target.value)];
                if (event.target.value !== '' && item) setDraft((old) => ({ ...old, model: item.draft.model, brand: companyName || item.draft.brand }));
              }}
            >
              <option value="">{t.newProduct}</option>
              {products.map((item, index) => (
                <option key={item.name} value={index}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {field('model', t.model, 120)}
          <label>
            {t.brand}
            <input value={draft.brand} readOnly={Boolean(companyName)} maxLength={80} onChange={(event) => update('brand', event.target.value)} />
            <small className="field-hint">
              {companyName ? t.brandFromCompany : t.brandHint}
            </small>
          </label>
          <button type="button" className="button button-secondary" onClick={() => persist(true)}>
            {t.saveProduct}
          </button>
        </fieldset>
      )}
      {step === 1 && (
        <fieldset>
          <legend>{t.lotLegend}</legend>
          {field('lot', t.lot, 60)}
          <button
            type="button"
            className="button button-secondary"
            onClick={() => update('lot', `VF-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`)}
          >
            {t.autoLot}
          </button>
          <p className="field-hint">{t.lotHint}</p>
          <label>
            {t.country}
            <select value={draft.country} onChange={(event) => update('country', event.target.value)}>
              <option value="">{t.countryPick}</option>
              {countries.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.quantity}
            <input type="number" min={1} max={500} value={draft.quantity} onChange={(event) => update('quantity', Number(event.target.value))} />
          </label>
        </fieldset>
      )}
      {step === 2 && (
        <fieldset>
          <legend>{t.labelLegend}</legend>
          <label>
            {t.format}
            <select value={draft.labelStyle} onChange={(event) => update('labelStyle', event.target.value as Draft['labelStyle'])}>
              <option value="standard">{t.standard}</option>
              <option value="compact">{t.compact}</option>
            </select>
          </label>
          {field('labelText', t.labelText, 160)}
          <div className={`config-label-preview ${draft.labelStyle}`}>
            <strong>{draft.brand || t.yourBrand}</strong>
            <span>{draft.model || t.modelPlaceholder}</span>
            <span>{t.lotPreview(draft.lot)}</span>
            <div className="config-qr-placeholders">
              <span>{t.publicQr}</span>
              <span>{t.secretQr}</span>
            </div>
            <small>{draft.labelText}</small>
            <small>{t.previewNote}</small>
          </div>
        </fieldset>
      )}
      {step === 3 && (
        <fieldset>
          <legend>{t.reviewLegend}</legend>
          <dl className="company-emission-values">
            <div>
              <dt>{t.review.product}</dt>
              <dd>
                {draft.brand} {draft.model}
              </dd>
            </div>
            <div>
              <dt>{t.review.lot}</dt>
              <dd>{draft.lot || '—'}</dd>
            </div>
            <div>
              <dt>{t.review.destination}</dt>
              <dd>{destination}</dd>
            </div>
            <div>
              <dt>{t.review.tokens}</dt>
              <dd>{draft.quantity}</dd>
            </div>
            <div>
              <dt>{t.review.amount}</dt>
              <dd>{pricePerToken ? `${(Number(pricePerToken) * draft.quantity).toFixed(2)} XLM` : t.amountLater}</dd>
            </div>
            <div>
              <dt>{t.review.label}</dt>
              <dd>{draft.labelStyle === 'compact' ? t.compactLabel : t.standard}</dd>
            </div>
          </dl>
          <p className="field-hint">{t.reviewHint}</p>
          <label>
            {t.saveTemplate}
            <input maxLength={80} value={name} placeholder={t.templatePlaceholder} onChange={(event) => setName(event.target.value)} />
          </label>
          <button type="button" className="button button-secondary" onClick={() => persist(false)}>
            {t.saveTemplateButton}
          </button>
          <p className="field-hint">{t.storageHint}</p>
        </fieldset>
      )}
      {notice && (
        <p role="status" className="field-hint">
          {notice}
        </p>
      )}
      <div className="config-actions">
        {step > 0 && (
          <button type="button" className="button button-secondary" onClick={() => setStep(step - 1)}>
            {t.previous}
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              if (step === 0 && !draft.model.trim()) {
                setNotice(t.enterModel);
                return;
              }
              if (step === 1 && !validate()) return;
              setNotice('');
              setStep(step + 1);
            }}
          >
            {t.next}
          </button>
        ) : (
          <button type="submit" className="button button-primary" disabled={submitting}>
            {submitting ? t.preparing : t.confirm}
          </button>
        )}
      </div>
    </form>
  );
}
