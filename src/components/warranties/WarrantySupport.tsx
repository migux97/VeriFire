import { useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { LedgerLink } from '@/components/ui/LedgerLink';
import { consumerDate, getConsumerMessages, type ConsumerLocale } from '@/i18n/consumer';
import type { Warranty } from '@/lib/types';
import { WarrantyCoverage } from './WarrantyCoverage';

export function WarrantySupport({ warranty, now, locale = 'es' }: { warranty: Warranty; now: number; locale?: ConsumerLocale }) {
  const labels = getConsumerMessages(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [notice, setNotice] = useState('');
  const fields = [
    [labels.support.product, warranty.model], [labels.support.lot, warranty.lot],
    [labels.support.serial, warranty.token], [labels.support.owner, warranty.owner || labels.support.missing],
    [labels.coverage.start, consumerDate(warranty.claimedAt, locale)],
    [labels.coverage.end, consumerDate(warranty.warrantyUntil, locale)],
    [labels.support.network, warranty.network]
  ];

  const download = () => {
    try {
      const text = [labels.support.document, `${labels.support.issued}: ${consumerDate(new Date().toISOString(), locale)}`, '',
        ...fields.map(([key, value]) => `${key}: ${value}`),
        ...(warranty.certificateUrl ? [`${labels.support.certificate}: ${warranty.certificateUrl}`] : [labels.support.noCertificate]),
        '', labels.support.instructions, labels.support.note].join('\n');
      // Only public warranty data: never include activation or transfer secrets.
      const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `verifire-${warranty.token.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(labels.support.downloaded);
    } catch {
      setNotice(labels.support.downloadError);
    }
  };

  return (
    <>
      <button ref={trigger} type="button" className="button button-primary warranty-manage" aria-haspopup="dialog"
        onClick={() => { setNotice(''); dialog.current?.showModal(); }}>
        <Icon name="fa-solid fa-headset" /> {labels.support.action}
      </button>
      <dialog ref={dialog} className="warranty-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-intro`}
        onClose={() => trigger.current?.focus()}>
        <div className="tw:flex tw:items-start tw:justify-between tw:gap-4">
          <div><p className="eyebrow">VERIFIRE</p><h2 id={`${id}-title`}>{labels.support.title}</h2></div>
          <button type="button" className="icon-button" aria-label={labels.support.close} onClick={() => dialog.current?.close()}>
            <Icon name="fa-solid fa-xmark" />
          </button>
        </div>
        <p id={`${id}-intro`} className="field-hint">{labels.support.intro}</p>
        <h3>{warranty.model}</h3>
        <WarrantyCoverage start={warranty.claimedAt} end={warranty.warrantyUntil} now={now} locale={locale} />
        <dl className="support-details">
          {fields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
        </dl>
        <p className="support-instructions">{labels.support.instructions}</p>
        {warranty.certificateUrl
          ? <LedgerLink href={warranty.certificateUrl}>{labels.support.certificate}</LedgerLink>
          : <p className="field-hint">{labels.support.noCertificate}</p>}
        <button type="button" className="button button-primary" onClick={download}>
          <Icon name="fa-solid fa-download" /> {labels.support.download}
        </button>
        <p className="field-hint">{labels.support.note}</p>
        <p className="field-hint" role="status">{notice}</p>
      </dialog>
    </>
  );
}
