import { formatMessage } from '@/i18n/landing';
import type { TechnicalLandingCopy } from '@/i18n/technical-landing';

interface Props { lot: string; copy: TechnicalLandingCopy['cases']['specs']; }

export function CaseSpecifications({ lot, copy }: Props) {
  return (
    <dl className="lp-case-specs tw:grid tw:gap-3">
      <div><dt>{copy.asset}</dt><dd className="tw:font-mono">{formatMessage(copy.assetValue, { lot })}</dd></div>
      <div><dt>{copy.activation}</dt><dd>{copy.activationValue}</dd></div>
      <div><dt>{copy.warranty}</dt><dd>{copy.warrantyValue}</dd></div>
    </dl>
  );
}
