import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ProductIllustration } from './ProductIllustration';
import { CaseSpecifications } from './CaseSpecifications';
import { useCaseRotation } from './useCaseRotation';
import { formatMessage, type LandingMessages } from '@/i18n/landing';
import type { TechnicalLandingCopy } from '@/i18n/technical-landing';
import type { SampleProduct } from './content';

export interface UseCaseItem extends SampleProduct { industry: string; description: string; }
interface Props { items: UseCaseItem[]; copy: TechnicalLandingCopy['cases']; artwork: LandingMessages['artwork']; locale: string; }

export function UseCaseCarousel({ items, copy, artwork, locale }: Props) {
  const [hovered, setHovered] = useState(false);
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const { active, previous, select, progressRef, paused } = useCaseRotation(items.length, hovered || touched || focused || historyOpen);
  const current = items[active]!;
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  useEffect(() => {
    const release = () => setTouched(false);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, []);

  const navigate = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = event.key === 'ArrowRight' ? (active + 1) % items.length
      : event.key === 'ArrowLeft' ? (active + items.length - 1) % items.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : undefined;
    if (index === undefined) return;
    event.preventDefault();
    select(index);
    tabs.current[index]?.focus();
  };

  return (
    <div className="lp-cases" data-use-cases data-active-product={current.id} data-paused={paused}
      role="region" aria-roledescription={copy.role} aria-label={copy.label}
      onPointerDownCapture={() => setFocused(false)}
      onKeyDownCapture={() => setFocused(true)}
      onFocus={(event) => setFocused(event.target.matches(':focus-visible'))}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <div className="lp-case-toolbar tw:flex tw:items-center tw:justify-between tw:gap-4">
        <span className="lp-case-navigation-label">{copy.navigation}</span>
        <div className="tw:flex tw:gap-2">
          <button type="button" className="lp-case-arrow" aria-label={copy.previous} aria-controls="lp-case-stage" onClick={() => select(active - 1)}>
            <i className="fa-solid fa-arrow-left" aria-hidden="true" />
          </button>
          <button type="button" className="lp-case-arrow" aria-label={copy.next} aria-controls="lp-case-stage" onClick={() => select(active + 1)}>
            <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div id="lp-case-stage" className="lp-case-stage tw:grid" aria-live={paused ? 'polite' : 'off'}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={(event) => { if (event.pointerType !== 'mouse') setTouched(true); }}>
        {items.map((item, index) => (
          <article key={item.id} id={`case-panel-${item.id}`} role="tabpanel" aria-labelledby={`case-tab-${item.id}`}
            aria-hidden={index !== active} inert={index !== active}
            className={`lp-case-slide tw:grid tw:gap-6 tw:md:grid-cols-[.8fr_1.2fr] ${index === active ? 'is-current' : index === previous ? 'is-leaving' : ''}`}>
            <div className="lp-case-art tw:relative tw:grid tw:place-items-center">
              <span className="lp-case-batch tw:absolute tw:left-5 tw:top-5 tw:font-mono tw:text-xs">{copy.batch} VF-{item.lot}</span>
              <ProductIllustration kind={item.id} color={item.labelColor} instance={`case-${item.id}`} labels={artwork} />
              <img className="lp-case-logo" src="/brand/verifire.png" width="103" height="32" alt="Verifire" />
            </div>
            <div className="lp-case-copy tw:flex tw:flex-col tw:justify-center tw:px-6 tw:pb-6 tw:md:pl-0 tw:md:py-6">
              <span className={`lp-ledger-chip ${item.activations.startsWith('0') ? 'is-pending' : ''}`}><span aria-hidden="true" />{item.activations.startsWith('0') ? copy.pending : copy.active}</span>
              <h3>{item.industry}</h3>
              <p className="lp-case-model">{item.model}</p>
              <p className="lp-case-description">{item.description}</p>
              <CaseSpecifications lot={item.lot} copy={copy.specs} />
              <div className="lp-case-factors tw:flex tw:flex-wrap tw:gap-3"><span><i className="fa-solid fa-eye" aria-hidden="true" />{copy.public}</span><span><i className="fa-solid fa-key" aria-hidden="true" />{copy.secret}</span></div>
              <div className="lp-case-query tw:font-mono tw:text-[11px]"><span>{copy.query}</span><small>{copy.simulated}</small></div>
            </div>
          </article>
        ))}
      </div>
      <div className="lp-case-pagination tw:flex tw:items-center tw:justify-between tw:gap-5">
        <div className="lp-case-tabs tw:flex tw:items-center" role="tablist" aria-label={copy.label}>
          {items.map((item, index) => (
            <button key={item.id} ref={(element) => { tabs.current[index] = element; }} id={`case-tab-${item.id}`} type="button" role="tab"
              aria-selected={index === active} aria-controls={`case-panel-${item.id}`} tabIndex={index === active ? 0 : -1}
              aria-label={formatMessage(copy.go, { industry: item.industry })} onClick={() => select(index)} onKeyDown={navigate}
              className={`lp-case-dot ${index === active ? 'is-current' : ''}`}>
              <span className="lp-case-dot-track"><span ref={index === active ? progressRef : undefined} /></span>
            </button>
          ))}
        </div>
        <p className="lp-case-inspect">{paused ? copy.paused : copy.inspect}</p>
      </div>
      <p className="lp-case-disclaimer">{copy.examples}</p>
      <details className="lp-case-history" onToggle={(event) => setHistoryOpen(event.currentTarget.open)}>
        <summary>{copy.history}<i className="fa-solid fa-chevron-down" aria-hidden="true" /></summary>
        <div className="tw:grid tw:gap-6 tw:p-6 tw:md:grid-cols-[1fr_2fr]">
          <dl className="lp-case-facts">
            <div><dt>{copy.serial}</dt><dd>{current.token}</dd></div>
            <div><dt>{copy.destination}</dt><dd>{current.destination}</dd></div>
            <div><dt>{copy.owner}</dt><dd>{current.owner}</dd></div>
          </dl>
          <ol className="lp-case-events">
            {current.events.map((event) => <li key={`${event.kind}-${event.date}`}><strong>{event.title}</strong><span>{event.place}</span><time dateTime={event.date}>{date.format(new Date(`${event.date}T00:00:00Z`))}</time></li>)}
          </ol>
        </div>
      </details>
    </div>
  );
}
