import { Icon } from './Icon';

export interface IssuerInfo {
  name: string;
  // Public address of the logo, or a data URL in the company's own preview.
  logoUrl: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
}

interface IssuerBadgeProps {
  issuer: IssuerInfo;
  labels: { issuedBy: string; write: string; call: string };
  // Subject of the email a buyer writes from here.
  subject?: string;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'VF';

// Who issued a product: the company's logo and name, and the shortest way to reach it. It says "issued by", never
// "verified": the name is what the company wrote about itself. The same badge is the buyer's card and the company's
// own preview of it.
export function IssuerBadge({ issuer, labels, subject }: IssuerBadgeProps) {
  const mail = issuer.email ? `mailto:${issuer.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}` : null;
  const tel = issuer.phone ? `tel:${issuer.phone.replace(/[^+\d]/g, '')}` : null;
  return (
    <div className="issuer">
      <span className={`issuer-mark${issuer.logoUrl ? ' has-logo' : ''}`} aria-hidden="true">
        {issuer.logoUrl ? <img src={issuer.logoUrl} alt="" loading="lazy" decoding="async" /> : initials(issuer.name)}
      </span>
      <span className="issuer-text">
        <small>{labels.issuedBy}</small>
        <strong>{issuer.name}</strong>
      </span>
      {(mail || tel) && (
        <span className="issuer-actions">
          {mail && (
            <a href={mail} aria-label={`${labels.write}: ${issuer.email}`} title={labels.write}>
              <Icon name="fa-solid fa-envelope" />
            </a>
          )}
          {tel && (
            <a href={tel} aria-label={`${labels.call}: ${issuer.phone}`} title={labels.call}>
              <Icon name="fa-solid fa-phone" />
            </a>
          )}
        </span>
      )}
    </div>
  );
}
