import { PaymentWarning } from '@/components/ui/PaymentWarning';
import { plural } from '@/lib/format';
import type { PurchaseSummary } from '@/lib/types';

interface PaymentDetailProps {
  summary: PurchaseSummary;
}

// A purchase still waiting for its payment: the Cosmos Pay QR, kept so it can be paid from the list.
export function PaymentDetail({ summary }: PaymentDetailProps) {
  return (
    <>
      <p>
        <strong>Pagá {summary.amount} {summary.asset}</strong> para emitir {summary.quantity} {plural(summary.quantity, 'token', 'tokens')} de {summary.model}.
      </p>
      <p className="batch-item-note">Escaneá el QR con Cosmos Pay. El lote se genera solo cuando se confirma el pago, y esta tarjeta se actualiza sola.</p>
      <PaymentWarning />
      {summary.payment?.qr
        ? <img className="payment-qr" src={summary.payment.qr} alt="QR de pago Cosmos Pay" width={240} height={240} />
        : <p className="batch-item-note is-error">Esta compra no tiene un QR de pago guardado.</p>}
    </>
  );
}
