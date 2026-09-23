import { useId } from 'react';
import { consumerDate, getConsumerMessages, type ConsumerLocale } from '@/i18n/consumer';
import { warrantyCoverage } from '@/lib/warranty-coverage';

export function WarrantyCoverage({ start, end, now, locale = 'es' }: { start: string | null; end: string | null; now: number; locale?: ConsumerLocale }) {
  const id = useId();
  const labels = getConsumerMessages(locale).coverage;
  const coverage = warrantyCoverage(start, end, now);
  if (!coverage) return <p className="field-hint">{labels.unknown}</p>;
  const remaining = labels.remaining.replace('{remaining}', String(coverage.remainingDays)).replace('{total}', String(coverage.totalDays));
  const status = coverage.state !== 'active' ? labels[coverage.state]
    : coverage.remainingDays === 1 ? labels.oneDay : labels.days.replace('{days}', String(coverage.remainingDays));

  return (
    <div className={`coverage-meter is-${coverage.state}`}>
      <div className="coverage-caption"><strong id={id}>{status}</strong><span>{remaining}</span></div>
      <div className="coverage-track" role="progressbar" aria-labelledby={id} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(coverage.percent)} aria-valuetext={`${labels.title}: ${remaining}`}>
        <span style={{ transform: `scaleX(${coverage.percent / 100})` }} />
      </div>
      <div className="coverage-dates">
        <span>{labels.start} <time dateTime={start!}>{consumerDate(start, locale)}</time></span>
        <span>{labels.end} <time dateTime={end!}>{consumerDate(end, locale)}</time></span>
      </div>
    </div>
  );
}
