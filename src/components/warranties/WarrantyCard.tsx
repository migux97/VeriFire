import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { LedgerLink } from '@/components/ui/LedgerLink';
import { StatusMessage, type Message } from '@/components/ui/StatusMessage';
import { ProductHistory } from '@/components/verification/ProductHistory';
import { useNow } from '@/components/ui/useNow';
import { formatCountdown, formatDay, formatMonth } from '@/lib/format';
import type { Warranty } from '@/lib/types';
import { fillIn, getConsumerMessages, type ConsumerLocale, type ConsumerMessages } from '@/i18n/consumer';
import { IssuerBadge } from '@/components/ui/IssuerBadge';

type CardLabels = ConsumerMessages['card'];
import { warrantyCoverage } from '@/lib/warranty-coverage';
import { WarrantyCoverage } from './WarrantyCoverage';
import { WarrantySupport } from './WarrantySupport';

interface WarrantyCardProps {
  warranty: Warranty;
  // The open transfer link, when this browser created it.
  transferLink: string | null;
  busy: boolean;
  status: Message | null;
  onOfferTransfer: () => void;
  onCancelTransfer: () => void;
  // Whether the choice of the home page is being saved for some product, and how to change it for this one.
  showcaseBusy: boolean;
  onToggleShowcase: (visible: boolean) => void;
  locale?: ConsumerLocale;
}

// The open link as text and as a QR, for the new owner to open or scan from their own panel.
function TransferLink({ link, labels }: { link: string; labels: CardLabels }) {
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let current = true;
    // Generated here: the link carries the transfer secret and must never reach a third-party QR service.
    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(link, { margin: 1, width: 200 }))
      .then((url) => {
        if (current) setQr(url);
      })
      // Without the image the link itself is still there to copy.
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [link]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="transfer-link">
      {qr && <img src={qr} alt={labels.qrAlt} width={160} height={160} />}
      <div className="transfer-link-copy">
        <label>
          {labels.linkLabel}
          <input type="text" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
        </label>
        <button className="button button-secondary" type="button" onClick={() => void copy()}>
          <Icon name={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`} /> {copied ? labels.copied : labels.copy}
        </button>
      </div>
    </div>
  );
}

export function WarrantyCard({ warranty, transferLink, busy, status, onOfferTransfer, onCancelTransfer, showcaseBusy, onToggleShowcase, locale = 'es' }: WarrantyCardProps) {
  const labels = getConsumerMessages(locale);
  const card = labels.card;
  const now = useNow(true, warranty.transferExpiresAt !== null ? 1000 : 60_000);
  const coverage = warrantyCoverage(warranty.claimedAt, warranty.warrantyUntil, now);
  const active = coverage?.state === 'active';
  // The link expires on its own: it is checked against the ticking clock.
  const offered = warranty.transferExpiresAt !== null && new Date(warranty.transferExpiresAt).getTime() > now;
  const expired = warranty.transferExpiresAt !== null && !offered;

  return (
    <article className="warranty-card">
      <div className="warranty-head">
        {warranty.photoUrl
          ? <img className="warranty-photo" src={warranty.photoUrl} alt={fillIn(card.photoAlt, { model: warranty.model })} width={72} height={72} loading="lazy" decoding="async" />
          : <div className="warranty-thumb" aria-hidden="true"><Icon name="fa-solid fa-box-open" /></div>}
        <div className="warranty-top">
          <span className={`warranty-badge${active ? '' : ' is-expired'}`}>
            <Icon name={`fa-solid ${active ? 'fa-shield-halved' : 'fa-clock-rotate-left'}`} /> {coverage ? labels.coverage[coverage.state] : labels.coverage.unknown}
          </span>
          <h3>{warranty.model}</h3>
        </div>
      </div>
      {warranty.issuer && (
        <IssuerBadge
          issuer={warranty.issuer}
          labels={{ issuedBy: card.issuedBy, write: card.writeIssuer, call: card.callIssuer, verified: card.issuerVerified, unverified: card.issuerUnverified }}
          subject={fillIn(labels.support.subject, { model: warranty.model, token: warranty.token })}
        />
      )}
      <WarrantyCoverage start={warranty.claimedAt} end={warranty.warrantyUntil} now={now} locale={locale} />
      <div className={`warranty-showcase${warranty.showcase ? ' is-on' : ''}`}>
        <span>
          <Icon name={`fa-solid ${warranty.showcase ? 'fa-eye' : 'fa-eye-slash'}`} /> {warranty.showcase ? card.showcase.on : card.showcase.off}
        </span>
        {warranty.canShowcase || warranty.showcase ? (
          <button className="button button-secondary" type="button" disabled={showcaseBusy} onClick={() => onToggleShowcase(!warranty.showcase)}>
            {warranty.showcase ? card.showcase.hide : card.showcase.show}
          </button>
        ) : (
          <small className="field-hint">{warranty.showcaseBlocked === 'unverified' ? card.showcase.unverified : card.showcase.noPhoto}</small>
        )}
      </div>
      <dl className="warranty-meta">
        <div>
          <dt>{card.claimedAt}</dt>
          <dd>{warranty.claimedAt ? formatDay(warranty.claimedAt, locale) : '—'}</dd>
        </div>
        <div>
          <dt>{card.coverage}</dt>
          <dd>{card.until} {warranty.warrantyUntil ? formatMonth(warranty.warrantyUntil, locale) : '—'}</dd>
          {/* The buyer only ever sees the certification: the transaction that activated the warranty in the contract,
              signed by the issuing account. The payment that bought the batch belongs to the company's treasury. */}
          {warranty.certificateUrl && (
            <dd>
              <LedgerLink href={warranty.certificateUrl} title={card.certificateTitle}>
                {labels.support.certificate}
              </LedgerLink>
            </dd>
          )}
        </div>
      </dl>

      {warranty.history.length > 0 && (
        <details className="warranty-history">
          <summary>{card.history} <Icon name="fa-solid fa-chevron-down" /></summary>
          <ProductHistory events={warranty.history} locale={locale} />
        </details>
      )}

      <WarrantySupport warranty={warranty} now={now} locale={locale} />
      {warranty.transferable && (
        <div className="warranty-transfer">
          {offered ? (
            <>
              <p className="warranty-transfer-note">
                <Icon name="fa-solid fa-right-left" /> {card.linkOpen}
              </p>
              {warranty.transferExpiresAt && (
                <p className="transfer-countdown" role="timer">
                  <Icon name="fa-regular fa-clock" /> {card.linkExpiresIn} <strong>{formatCountdown(warranty.transferExpiresAt, now)}</strong>
                </p>
              )}
              {transferLink
                ? <TransferLink link={transferLink} labels={card} />
                : <p className="field-hint">{card.linkElsewhere}</p>}
              <div className="warranty-transfer-actions">
                {!transferLink && (
                  <button className="button button-secondary" type="button" disabled={busy} onClick={onOfferTransfer}>
                    <Icon name="fa-solid fa-link" /> {card.newLink}
                  </button>
                )}
                <button className="button button-secondary" type="button" disabled={busy} onClick={onCancelTransfer}>
                  <Icon name="fa-solid fa-xmark" /> {card.cancel}
                </button>
              </div>
            </>
          ) : (
            <>
              {expired && <p className="field-hint">{card.linkExpired}</p>}
              <button className="button button-secondary" type="button" disabled={busy} onClick={onOfferTransfer}>
                <Icon name="fa-solid fa-right-left" /> {card.transfer}
              </button>
            </>
          )}
          <StatusMessage message={status} />
        </div>
      )}
    </article>
  );
}
