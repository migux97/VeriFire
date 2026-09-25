import { Icon } from '@/components/ui/Icon';
import type { ClaimPreview } from '@/lib/types';
import { fillIn, getConsumerMessages, type ConsumerLocale } from '@/i18n/consumer';

interface ShowcaseConsentProps {
  // Null while it is being asked, and for a QR that has no preview.
  preview: ClaimPreview | null;
  checking: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
  locale?: ConsumerLocale;
}

// Asked before activating: whether to show the product on the home page. It says what would be public, and it cannot be
// ticked for a product whose batch has no photo. Nothing is ticked by default.
export function ShowcaseConsent({ preview, checking, checked, onChange, disabled, locale = 'es' }: ShowcaseConsentProps) {
  const text = getConsumerMessages(locale).claim.showcase;
  if (checking) return <p className="showcase-consent-note" role="status">{text.checking}</p>;
  if (!preview) return null;
  const possible = preview.canShowcase;
  return (
    <fieldset className={`showcase-consent${possible ? '' : ' is-unavailable'}`}>
      <legend>{text.title}</legend>
      <div className="showcase-consent-product">
        {preview.photoUrl && <img src={preview.photoUrl} alt={fillIn(text.productPhoto, { model: preview.model })} loading="lazy" decoding="async" />}
        <strong>{preview.model}</strong>
      </div>
      {possible ? (
        <>
          <p className="showcase-consent-warning" id="showcase-warning">
            <Icon name="fa-solid fa-triangle-exclamation" /> <strong>{text.warningTitle}.</strong> {text.warning}
          </p>
          <label className="showcase-consent-check">
            <input type="checkbox" checked={checked} disabled={disabled} aria-describedby="showcase-warning" onChange={(event) => onChange(event.currentTarget.checked)} />
            <span>{text.label}</span>
          </label>
        </>
      ) : (
        <p className="showcase-consent-note">
          <Icon name={preview.blocked === 'unverified' ? 'fa-solid fa-shield-halved' : 'fa-regular fa-image'} /> {preview.blocked === 'unverified' ? text.unverified : text.noPhoto}
        </p>
      )}
    </fieldset>
  );
}
