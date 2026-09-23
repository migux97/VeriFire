import { useState } from 'react';
import { ProductIllustration } from './ProductIllustration';
import type { SampleProduct } from './content';
import type { LandingMessages } from '@/i18n/landing';
import type { TechnicalLandingCopy } from '@/i18n/technical-landing';

interface Props {
  copy: TechnicalLandingCopy['audit'];
  artwork: LandingMessages['artwork'];
  product: SampleProduct;
}

export function AuditWidget({ copy, artwork, product }: Props) {
  const [factor, setFactor] = useState<'public' | 'secret'>('public');
  return (
    <section className="lp-audit tw:relative tw:overflow-hidden tw:rounded-2xl" aria-label={copy.title}
      data-audit-widget data-active-product={product.id} data-factor={factor}>
      <header className="lp-audit-header tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3">
        <span className="lp-network tw:inline-flex tw:items-center tw:gap-2"><span aria-hidden="true" />{copy.network}</span>
        <span className="tw:font-mono tw:text-[10px]">{copy.node}</span>
      </header>
      <div className="tw:flex tw:items-center tw:justify-between tw:px-6 tw:pt-5">
        <span className="lp-demo-label">{copy.demo}</span>
        <img src="/brand/verifire-mark.png" width="24" height="24" alt="Verifire" />
      </div>
      <div className="lp-audit-render tw:relative tw:grid tw:place-items-center">
        <div className="lp-audit-grid" aria-hidden="true" />
        <svg className="lp-audit-connectors" viewBox="0 0 440 290" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <g data-factor-line="public">
            <path d="M130 40H160V125H190" />
            <circle cx="190" cy="125" r="3" />
          </g>
          <g data-factor-line="secret">
            <path d="M320 231H286V207H261" />
            <circle cx="261" cy="207" r="3" />
          </g>
        </svg>
        <ProductIllustration kind={product.id} color="#E52E20" instance="audit" labels={artwork} />
        <strong className="lp-audit-model">{product.model}</strong>
        <button type="button" className="lp-qr-badge lp-qr-badge-public" aria-pressed={factor === 'public'} aria-controls="audit-factor-detail" onClick={() => setFactor('public')}>
          <i className="fa-solid fa-qrcode" aria-hidden="true" />{copy.publicQr}
        </button>
        <button type="button" className="lp-qr-badge lp-qr-badge-secret" aria-pressed={factor === 'secret'} aria-controls="audit-factor-detail" onClick={() => setFactor('secret')}>
          <i className="fa-solid fa-lock" aria-hidden="true" />{copy.secretQr}
        </button>
      </div>
      <p className="lp-audit-explanation" id="audit-factor-detail" aria-live="polite">
        <span key={factor} className="lp-audit-detail-text">{factor === 'public' ? copy.publicText : copy.secretText}</span>
      </p>
      <dl className="lp-audit-data tw:grid tw:gap-3 tw:font-mono tw:text-xs">
        <div><dt>{copy.hash}</dt><dd>0x7f…3a9c</dd></div>
        <div><dt>{copy.asset}</dt><dd>{product.token}</dd></div>
        <div><dt>{copy.ledger}</dt><dd className="lp-ledger-active">{copy.state}</dd></div>
      </dl>
      <p className="lp-audit-note">{copy.note}</p>
    </section>
  );
}
