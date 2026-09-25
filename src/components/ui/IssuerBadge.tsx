import { useState } from 'react';
import { Icon } from './Icon';

export interface IssuerInfo {
  name: string;
  // Public address of the logo, or a data URL in the company's own preview.
  logoUrl: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  // Verifire checked the company. Absent in the company's own preview, where it is not shown.
  verified?: boolean;
}

interface IssuerBadgeProps {
  issuer: IssuerInfo;
  labels: { issuedBy: string; write: string; call: string; verified?: string; unverified?: string };
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

// Who issued a product: the company's logo and name, and the shortest way to reach it. "Verified" appears only when
// Verifire checked the company by hand (see verification.ts); otherwise the name is what the company wrote about itself,
// and the badge says so. The same badge is the buyer's card and the company's own preview of it.
export function IssuerBadge({ issuer, labels, subject }: IssuerBadgeProps) {
  const mail = issuer.email ? `mailto:${issuer.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}` : null;
  const tel = issuer.phone ? `tel:${issuer.phone.replace(/[^+\d]/g, '')}` : null;
  // The address of a logo that failed to load: the initials take its place instead of a broken image.
  const [failed, setFailed] = useState<string | null>(null);
  const logo = issuer.logoUrl && issuer.logoUrl !== failed ? issuer.logoUrl : null;
  return (
    <div className="issuer">
      <span className={`issuer-mark${logo ? ' has-logo' : ''}`} aria-hidden="true">
        {logo ? <img src={logo} alt="" loading="lazy" decoding="async" onError={() => setFailed(logo)} /> : initials(issuer.name)}
      </span>
      <span className="issuer-text">
        <small>{labels.issuedBy}</small>
        <strong>
          {issuer.name}
          {issuer.verified && labels.verified && <i className="fa-solid fa-circle-check issuer-check" title={labels.verified} role="img" aria-label={labels.verified} />}
        </strong>
        {issuer.verified !== undefined && (issuer.verified ? labels.verified : labels.unverified) && (
          <em className={`issuer-trust${issuer.verified ? ' is-verified' : ''}`}>{issuer.verified ? labels.verified : labels.unverified}</em>
        )}
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
