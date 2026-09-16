import type { ReactNode } from 'react';
import { formatLongDate } from '@/lib/format';
import type { ProductStatus, PublicProduct } from '@/lib/types';
import { DetailRows } from './DetailRows';

const STATUS_LABELS: Record<ProductStatus, string> = {
  SEALED: 'Sellado en fábrica',
  CLAIMED_IN_WARRANTY: 'Garantía activa'
};

// Written in UTC on the server; LocalDates.astro rewrites it in the visitor's time zone.
function LocalDate({ iso }: { iso: string }) {
  return <time dateTime={iso} data-local-date="">{formatLongDate(iso, 'UTC')}</time>;
}

interface ProductDetailsProps {
  product: PublicProduct;
}

export function ProductDetails({ product }: ProductDetailsProps) {
  return (
    <DetailRows
      tone={product.claimed ? 'active' : 'available'}
      rows={[
        ['Producto', product.token],
        ['Modelo', product.model],
        ['Lote', product.lot],
        ['Destino', product.destination],
        ['Estado', STATUS_LABELS[product.status]],
        ...(product.claimed && product.claimedAt && product.warrantyUntil
          ? [
            ['Garantía activada el', <LocalDate iso={product.claimedAt} />],
            ['Cobertura hasta', <LocalDate iso={product.warrantyUntil} />]
          ] satisfies [string, ReactNode][]
          : [])
      ]}
    />
  );
}
