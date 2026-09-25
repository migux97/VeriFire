import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { formatMessage, type LandingMessages } from '@/i18n/landing';
import type { ShowcaseCopy } from '@/i18n/showcase';
import type { TechnicalLandingCopy } from '@/i18n/technical-landing';
import type { ShowcaseItem } from '@/lib/types';
import { CaseSpecifications } from './CaseSpecifications';
import type { SampleProduct } from './content';
import { ProductIllustration } from './ProductIllustration';
import { useCaseRotation } from './useCaseRotation';

export interface UseCaseItem extends SampleProduct { industry: string; description: string; }

// Each product stays long enough to read what it says.
const ROTATION_MS = 6000;
// New verifications, and products whose owners took them down, reach an open page within a minute. The list is small
// and the server keeps it in a public cache for 30 s, so this costs nothing.
const REFRESH_MS = 60_000;
// While fewer real products than this were chosen, examples fill the carousel, each one marked as an example.
const MIN_SLIDES = 5;

type Slide = { kind: 'live'; key: string; item: ShowcaseItem } | { kind: 'example'; key: string; item: UseCaseItem };

interface Props {
  // What the server had when it built the page.
  initial: ShowcaseItem[];
  examples: UseCaseItem[];
  copy: TechnicalLandingCopy['cases'];
  live: ShowcaseCopy;
  artwork: LandingMessages['artwork'];
  locale: string;
}

// "hace 3 horas", "ayer": how long ago a product was verified.
const age = (iso: string, now: number, locale: string) => {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of [['day', 86_400], ['hour', 3_600], ['minute', 60]] as const) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'second');
};

// The carousel of the home page: the latest verified products whose owners chose to show them, newest first. While
// there are few, the examples of each industry follow them, marked as examples. It asks the server again every minute.
export function LiveCases({ initial, examples, copy, live, artwork, locale }: Props) {
  const [items, setItems] = useState(initial);

  useEffect(() => {
    let current = true;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch('/api/showcase');
        if (!response.ok) return;
        const data = (await response.json()) as { items?: ShowcaseItem[] };
        if (current && Array.isArray(data.items)) setItems(data.items);
      } catch {
        // Without network the carousel keeps what it has.
      }
    };
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    // Coming back to a tab left open for hours shows today's products, not those of when it was opened.
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const slides: Slide[] = [
    ...items.map((item): Slide => ({ kind: 'live', key: item.token, item })),
    ...examples.slice(0, Math.max(0, MIN_SLIDES - items.length)).map((item): Slide => ({ kind: 'example', key: `example-${item.id}`, item }))
  ];
  const hasLive = items.length > 0;

  return (
    <section className="lp-catalog lp-use-cases" id="history" aria-labelledby="lp-catalog-title">
      <div className="lp-catalog-head">
        <div>
          <p className="lp-eyebrow">
            {hasLive && <span className="lp-eyebrow-dot lp-pulse" aria-hidden="true" />}
            {hasLive ? live.live : live.eyebrow}
          </p>
          <h2 id="lp-catalog-title">{live.title}</h2>
        </div>
        <p>{hasLive ? live.lead : live.leadEmpty}</p>
      </div>
      <Carousel slides={slides} copy={copy} live={live} artwork={artwork} locale={locale} />
    </section>
  );
}

interface CarouselProps {
  slides: Slide[];
  copy: TechnicalLandingCopy['cases'];
  live: ShowcaseCopy;
  artwork: LandingMessages['artwork'];
  locale: string;
}

function Carousel({ slides, copy, live, artwork, locale }: CarouselProps) {
  const [hovered, setHovered] = useState(false);
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  // Null until the page is in the browser: the server writes the date, the browser then says how long ago it was.
  const [now, setNow] = useState<number | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const { active, previous, select, progressRef, paused } = useCaseRotation(slides.length, hovered || touched || focused, ROTATION_MS);
  const current = slides[active] ?? slides[0]!;
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  useEffect(() => {
    setNow(Date.now());
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    const release = () => setTouched(false);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.clearInterval(clock);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, []);

  // After a refresh the product on screen stays on screen, wherever it moved in the list.
  const shown = useRef(current.key);
  const keys = slides.map((slide) => slide.key).join(',');
  useEffect(() => {
    const index = slides.findIndex((slide) => slide.key === shown.current);
    if (index >= 0 && index !== active) select(index);
    else if (index < 0 && active >= slides.length) select(0);
  }, [keys]);
  shown.current = current.key;

  const navigate = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = event.key === 'ArrowRight' ? (active + 1) % slides.length
      : event.key === 'ArrowLeft' ? (active + slides.length - 1) % slides.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : undefined;
    if (index === undefined) return;
    event.preventDefault();
    select(index);
    tabs.current[index]?.focus();
  };

  const titleOf = (slide: Slide) => (slide.kind === 'live' ? slide.item.model : slide.item.industry);
  const hasExamples = slides.some((slide) => slide.kind === 'example');

  return (
    <div className="lp-cases" data-paused={paused} role="region" aria-roledescription={copy.role} aria-label={live.label}
      onPointerDownCapture={() => setFocused(false)}
      onKeyDownCapture={() => setFocused(true)}
      onFocus={(event) => setFocused(event.target.matches(':focus-visible'))}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <div className="lp-case-toolbar tw:flex tw:items-center tw:justify-between tw:gap-4">
        <span className="lp-case-navigation-label">{live.navigation}</span>
        <div className="tw:flex tw:gap-2">
          <button type="button" className="lp-case-arrow" aria-label={live.previous} aria-controls="lp-case-stage" onClick={() => select(active - 1)}>
            <i className="fa-solid fa-arrow-left" aria-hidden="true" />
          </button>
          <button type="button" className="lp-case-arrow" aria-label={live.next} aria-controls="lp-case-stage" onClick={() => select(active + 1)}>
            <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div id="lp-case-stage" className="lp-case-stage tw:grid" aria-live={paused ? 'polite' : 'off'}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={(event) => { if (event.pointerType !== 'mouse') setTouched(true); }}>
        {slides.map((slide, index) => (
          <article key={slide.key} id={`case-panel-${slide.key}`} role="tabpanel" aria-labelledby={`case-tab-${slide.key}`}
            aria-hidden={index !== active} inert={index !== active}
            className={`lp-case-slide tw:grid tw:gap-6 tw:md:grid-cols-[.8fr_1.2fr] ${index === active ? 'is-current' : index === previous ? 'is-leaving' : ''}`}>
            {slide.kind === 'live'
              ? <LiveSlide item={slide.item} eager={index < 2} live={live} now={now} date={date} locale={locale} />
              : <ExampleSlide item={slide.item} copy={copy} live={live} artwork={artwork} />}
          </article>
        ))}
      </div>
      <div className="lp-case-pagination tw:flex tw:items-center tw:justify-between tw:gap-5">
        <div className="lp-case-tabs tw:flex tw:flex-wrap tw:items-center" role="tablist" aria-label={live.label}>
          {slides.map((slide, index) => (
            <button key={slide.key} ref={(element) => { tabs.current[index] = element; }} id={`case-tab-${slide.key}`} type="button" role="tab"
              aria-selected={index === active} aria-controls={`case-panel-${slide.key}`} tabIndex={index === active ? 0 : -1}
              aria-label={formatMessage(live.go, { model: titleOf(slide) })} onClick={() => select(index)} onKeyDown={navigate}
              className={`lp-case-dot ${index === active ? 'is-current' : ''}`}>
              <span className="lp-case-dot-track"><span ref={index === active ? progressRef : undefined} /></span>
            </button>
          ))}
        </div>
        <p className="lp-case-inspect">{paused ? live.paused : live.inspect}</p>
      </div>
      <p className="lp-case-disclaimer">{live.note}{hasExamples ? ` ${live.examplesNote}` : ''}</p>
    </div>
  );
}

interface LiveSlideProps {
  item: ShowcaseItem;
  eager: boolean;
  live: ShowcaseCopy;
  now: number | null;
  date: Intl.DateTimeFormat;
  locale: string;
}

// A real product, as its owner agreed to show it.
function LiveSlide({ item, eager, live, now, date, locale }: LiveSlideProps) {
  return (
    <>
      <div className="lp-case-art lp-live-art tw:relative tw:grid tw:place-items-center">
        {/* The company that issued it, on the photo: its logo and its name. */}
        {item.issuer && (
          <span className="lp-live-art-brand">
            <IssuerMark issuer={item.issuer} />
            <strong>{item.issuer.name}</strong>
          </span>
        )}
        <img className="lp-live-photo" src={item.photoUrl} alt={formatMessage(live.photoAlt, { model: item.model })} loading={eager ? 'eager' : 'lazy'} decoding="async" />
        <img className="lp-case-logo" src="/brand/verifire.png" width="103" height="32" alt="Verifire" />
      </div>
      <div className="lp-case-copy tw:flex tw:flex-col tw:justify-center tw:px-6 tw:pb-6 tw:md:pl-0 tw:md:py-6">
        <span className="lp-ledger-chip"><span aria-hidden="true" />
          {formatMessage(live.chip, { age: now === null ? date.format(new Date(item.verifiedAt)) : age(item.verifiedAt, now, locale) })}
        </span>
        <h3>{item.model}</h3>
        <div className="lp-live-issuer">
          <IssuerMark issuer={item.issuer} />
          <span>
            <small>{live.specs.issuer}</small>
            <strong>
              {item.issuer?.name ?? live.unknownIssuer}
              {item.issuer && <i className="fa-solid fa-circle-check lp-live-check" title={live.verifiedIssuer} role="img" aria-label={live.verifiedIssuer} />}
            </strong>
          </span>
        </div>
        <dl className="lp-case-specs tw:grid tw:gap-3">
          <div><dt>{live.specs.destination}</dt><dd>{item.destination}</dd></div>
          <div><dt>{live.specs.verifiedAt}</dt><dd>{date.format(new Date(item.verifiedAt))}</dd></div>
          <div><dt>{live.specs.record}</dt><dd>{item.onChain ? live.onChain : live.offChain}</dd></div>
        </dl>
        <div className="lp-case-factors tw:flex tw:flex-wrap tw:gap-3"><span><i className="fa-solid fa-eye" aria-hidden="true" />{live.public}</span><span><i className="fa-solid fa-key" aria-hidden="true" />{live.secret}</span></div>
      </div>
    </>
  );
}

// The company's logo on a white tile, or its initials when it has none or it cannot be loaded.
function IssuerMark({ issuer }: { issuer: ShowcaseItem['issuer'] }) {
  const [failed, setFailed] = useState(false);
  const name = issuer?.name ?? '';
  const initials = name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'VF';
  return (
    <span className="lp-live-issuer-mark" aria-hidden="true">
      {issuer?.logoUrl && !failed
        ? <img src={issuer.logoUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        : initials}
    </span>
  );
}

// An example of an industry, said to be one on the card itself.
function ExampleSlide({ item, copy, live, artwork }: { item: UseCaseItem; copy: TechnicalLandingCopy['cases']; live: ShowcaseCopy; artwork: LandingMessages['artwork'] }) {
  return (
    <>
      <div className="lp-case-art tw:relative tw:grid tw:place-items-center">
        <ProductIllustration kind={item.id} color={item.labelColor} instance={`case-${item.id}`} labels={artwork} />
        <img className="lp-case-logo" src="/brand/verifire.png" width="103" height="32" alt="Verifire" />
      </div>
      <div className="lp-case-copy tw:flex tw:flex-col tw:justify-center tw:px-6 tw:pb-6 tw:md:pl-0 tw:md:py-6">
        <span className="lp-ledger-chip is-example"><span aria-hidden="true" />{live.example}</span>
        <h3>{item.industry}</h3>
        <p className="lp-case-model">{item.model}</p>
        <p className="lp-case-description">{item.description}</p>
        <CaseSpecifications lot={item.lot} copy={copy.specs} />
        <div className="lp-case-factors tw:flex tw:flex-wrap tw:gap-3"><span><i className="fa-solid fa-eye" aria-hidden="true" />{copy.public}</span><span><i className="fa-solid fa-key" aria-hidden="true" />{copy.secret}</span></div>
      </div>
    </>
  );
}
