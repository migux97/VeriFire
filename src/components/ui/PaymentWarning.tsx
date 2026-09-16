import { Icon } from './Icon';

// A payment QR can always be paid again: Stellar has no way to revoke an address.
export function PaymentWarning({ as: Element = 'p' }: { as?: 'p' | 'span' }) {
  return (
    <Element className="payment-warning">
      <Icon name="fa-solid fa-triangle-exclamation" /> Pagá una sola vez: este QR es una transferencia real y se puede volver a pagar, pero un segundo pago no genera otro lote.
    </Element>
  );
}
