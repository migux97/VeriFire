import type { ReactNode } from 'react';

export type DetailTone = 'available' | 'active';

interface DetailRowsProps {
  tone: DetailTone;
  rows: [label: string, value: ReactNode][];
}

// Key/value rows of the public pages. Rendered on the server: no JavaScript reaches the browser.
export function DetailRows({ tone, rows }: DetailRowsProps) {
  return (
    <div className={`verify-details is-${tone}`}>
      {rows.map(([label, value], index) => (
        <span key={`${label}-${index}`}>
          <strong>{label}:</strong> {value}
        </span>
      ))}
    </div>
  );
}
