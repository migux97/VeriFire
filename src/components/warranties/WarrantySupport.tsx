// Support for an activated product: the company that issued it and the email it set for support (Configuración →
// Garantías de productos in its panel). Nothing else of the company is shown to the buyer.
import { useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { fillIn, getConsumerMessages, type ConsumerLocale } from '@/i18n/consumer';
import type { Warranty } from '@/lib/types';

export function WarrantySupport({ warranty, locale = 'es' }: { warranty: Warranty; now?: number; locale?: ConsumerLocale }) {
  const labels = getConsumerMessages(locale).support;
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [copied, setCopied] = useState(false);
  const support = warranty.support;
  const subject = fillIn(labels.subject, { model: warranty.model, token: warranty.token });

  const copy = async () => {
    if (!support) return;
    try {
      await navigator.clipboard.writeText(support.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Without clipboard access the address is still on screen to copy by hand.
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="button button-primary warranty-manage"
        aria-haspopup="dialog"
        onClick={() => {
          setCopied(false);
          dialog.current?.showModal();
        }}
      >
        <Icon name="fa-solid fa-headset" /> {labels.action}
      </button>
      <dialog ref={dialog} className="warranty-dialog support-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-intro`} onClose={() => trigger.current?.focus()}>
        <div className="support-dialog-head">
          <span className="support-dialog-icon" aria-hidden="true">
            <i className="fa-solid fa-headset" />
          </span>
          <div>
            <h2 id={`${id}-title`}>{labels.title}</h2>
            <p className="support-dialog-product">
              {warranty.model} · <span>{warranty.token}</span>
            </p>
          </div>
          <button type="button" className="icon-button" aria-label={labels.close} onClick={() => dialog.current?.close()}>
            <Icon name="fa-solid fa-xmark" />
          </button>
        </div>

        {support ? (
          <>
            <p id={`${id}-intro`} className="field-hint">
              {labels.intro}
            </p>
            <dl className="support-details">
              <div>
                <dt>{labels.company}</dt>
                <dd>{support.company}</dd>
              </div>
              <div>
                <dt>{labels.email}</dt>
                <dd>
                  <a href={`mailto:${support.email}?subject=${encodeURIComponent(subject)}`}>{support.email}</a>
                </dd>
              </div>
            </dl>
            <div className="support-dialog-actions">
              <a className="button button-primary" href={`mailto:${support.email}?subject=${encodeURIComponent(subject)}`}>
                <Icon name="fa-solid fa-envelope" /> {labels.write}
              </a>
              <button type="button" className="button button-secondary" onClick={() => void copy()}>
                <Icon name={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'} /> {copied ? labels.copied : labels.copy}
              </button>
            </div>
          </>
        ) : (
          <p id={`${id}-intro`} className="support-dialog-missing">
            <Icon name="fa-solid fa-circle-info" /> {labels.noEmail}
          </p>
        )}
      </dialog>
    </>
  );
}
