// "Marca para tus compradores" in Configuración: how the company shows on each warranty, whether it is published, and the
// stellar.toml it can publish on its own website. Nothing here is published until the company presses the button.
import { useEffect, useMemo, useState } from 'react';
import { IssuerBadge } from '@/components/ui/IssuerBadge';
import { ACCOUNT_DATA_EVENT } from '@/lib/client/account-data';
import { currentBrand, brandStatus, publishBrand, readPublishedBrand, unpublishBrand, type BrandStatus, type PublishedBrand } from '@/lib/client/brand';
import { COMPANY_PROFILE_EVENT, readCompanyProfile } from '@/lib/client/company-profile';
import { downloadBlob } from '@/lib/client/download';
import { demoModeActive } from '@/lib/client/session';
import { storedUser } from '@/lib/client/account';
import { currentWorkspace } from '@/lib/client/workspace';
import { errorMessage } from '@/lib/errors';
import { buildStellarToml } from '@/lib/stellar-toml';
import { useCompanyText } from './CompanyText';

interface Notice {
  text: string;
  tone: 'success' | 'error';
}

export function CompanyBrandSettings({ cavosAppId }: { cavosAppId: string }) {
  const t = useCompanyText();
  const text = t.settings.brand;
  const [brand, setBrand] = useState(currentBrand);
  const [profile, setProfile] = useState(readCompanyProfile);
  const [published, setPublished] = useState<PublishedBrand | null>(null);
  const [status, setStatus] = useState<BrandStatus>('unpublished');
  const [editable, setEditable] = useState(false);
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Everything shown here comes from the profile, the support settings and the state of the publication: it is read
  // again whenever any of them changes, in this browser or in another one of the account.
  useEffect(() => {
    let active = true;
    const load = () => {
      setBrand(currentBrand());
      setProfile(readCompanyProfile());
      setPublished(readPublishedBrand());
      setEditable(Boolean(currentWorkspace(storedUser())?.own));
      setDemo(demoModeActive());
      void brandStatus().then((next) => active && setStatus(next));
    };
    load();
    window.addEventListener(COMPANY_PROFILE_EVENT, load);
    window.addEventListener(ACCOUNT_DATA_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(COMPANY_PROFILE_EVENT, load);
      window.removeEventListener(ACCOUNT_DATA_EVENT, load);
    };
  }, []);

  const run = async (task: () => Promise<string>) => {
    setBusy(true);
    setNotice(null);
    try {
      setNotice({ text: await task(), tone: 'success' });
    } catch (error) {
      setNotice({ text: `${text.failed} ${errorMessage(error)}`, tone: 'error' });
    } finally {
      setBusy(false);
      setPublished(readPublishedBrand());
      void brandStatus().then(setStatus);
    }
  };

  const publish = () =>
    run(async () => {
      const wasPublished = Boolean(readPublishedBrand());
      await publishBrand(cavosAppId);
      return wasPublished ? text.updatedDone : text.publishedDone;
    });

  const takeDown = () =>
    run(async () => {
      await unpublishBrand(cavosAppId);
      return text.unpublishedDone;
    });

  const toml = useMemo(
    () =>
      buildStellarToml({
        commercialName: brand.name,
        legalName: profile.legalName,
        website: profile.website,
        description: profile.description,
        officialEmail: profile.email,
        supportEmail: brand.supportEmail,
        logoUrl: published?.logoUrl ?? ''
      }),
    [brand, profile, published]
  );

  const downloadToml = () => {
    downloadBlob(new Blob([toml.text], { type: 'text/plain;charset=utf-8' }), 'stellar.toml');
    setNotice({ text: text.toml.downloaded, tone: 'success' });
  };

  const canPublish = editable && !demo && !busy && brand.name.trim().length > 0;
  const issuer = {
    name: brand.name.trim() || t.identity.unconfigured,
    logoUrl: brand.logo || null,
    website: brand.website || null,
    email: brand.supportEmail || null,
    phone: brand.supportPhone || null
  };

  return (
    <section className="company-card settings-card company-brand-settings" aria-labelledby="brand-settings-title">
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <i className="fa-solid fa-store" />
        </span>
        <div>
          <h2 id="brand-settings-title">{text.title}</h2>
          <p>{text.lead}</p>
        </div>
      </div>
      {!editable && <p className="company-data-empty">{text.readOnly}</p>}
      {demo && <p className="company-data-empty">{text.demo}</p>}

      <div className="brand-preview">
        <span className="profile-label">{text.preview}</span>
        <IssuerBadge issuer={issuer} labels={{ issuedBy: text.issuedBy, write: text.write, call: text.call }} />
        {!brand.supportEmail && <small className="profile-hint brand-warning">{text.noSupportEmail}</small>}
      </div>

      <div className="brand-publication">
        <span className={`brand-status is-${status}`} role="status">
          {text.status[status]}
        </span>
        {published && status !== 'unpublished' && <small className="profile-hint">{text.publishedAt(new Date(published.publishedAt).toLocaleDateString())}</small>}
        <div className="settings-actions">
          <button type="button" className="company-button is-primary" disabled={!canPublish || status === 'current'} onClick={() => void publish()}>
            <i className={`fa-solid ${busy ? 'fa-circle-notch fa-spin' : 'fa-bullhorn'}`} aria-hidden="true" /> {busy ? text.working : status === 'unpublished' ? text.publish : text.update}
          </button>
          {status !== 'unpublished' && (
            <button type="button" className="company-button is-ghost" disabled={!editable || demo || busy} onClick={() => void takeDown()}>
              {text.unpublish}
            </button>
          )}
        </div>
        {!brand.name.trim() && editable && <small className="profile-hint brand-warning">{text.needName}</small>}
      </div>

      <div className="brand-toml">
        <h3>{text.toml.title}</h3>
        <p>{text.toml.lead}</p>
        <div className="brand-toml-keys" aria-label={text.toml.included}>
          {toml.included.map((key) => (
            <span key={key} className="brand-key is-included" title={text.toml.included}>
              <i className="fa-solid fa-check" aria-hidden="true" /> {text.toml.keys[key] ?? key}
            </span>
          ))}
          {toml.omitted.map(({ key, reason }) => (
            <span key={key} className="brand-key is-omitted" title={text.toml.omitted}>
              <i className="fa-solid fa-minus" aria-hidden="true" /> {text.toml.keys[key] ?? key}: {text.toml.reasons[reason] ?? reason}
            </span>
          ))}
        </div>
        {!published?.logoUrl && <small className="profile-hint">{text.toml.logoHint}</small>}
        {toml.warnings.map((warning) => (
          <small key={warning} className="profile-hint brand-warning">
            {text.toml.warnings[warning] ?? warning}
          </small>
        ))}
        <div className="settings-actions">
          <button type="button" className="company-button" disabled={!toml.included.length} onClick={downloadToml}>
            <i className="fa-solid fa-file-arrow-down" aria-hidden="true" /> {text.toml.download}
          </button>
        </div>
        <details className="brand-toml-where">
          <summary>{text.toml.whereTitle}</summary>
          <p>{text.toml.where}</p>
          <p>{text.toml.note}</p>
        </details>
      </div>

      {notice && (
        <p className={notice.tone === 'success' ? 'settings-success' : 'settings-error'} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}
    </section>
  );
}
