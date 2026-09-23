// The public QR of a box, read with the camera, an uploaded image or a pasted screenshot (Ctrl+V): it opens the
// verification of that product, the same page the QR links to.
import { useState } from 'react';
import type { Message } from '@/components/ui/StatusMessage';
import { Toast } from '@/components/ui/Toast';
import { QrScanPanel } from '@/components/warranties/QrScanPanel';
import { parseScannedQr } from '@/lib/qr-codes';

// A QR that holds only the code, without the link.
const PLAIN_CODE = /^[A-Z0-9][A-Z0-9-]{2,40}$/i;

export function VerifyScanner() {
  const [message, setMessage] = useState<Message | null>(null);

  const openProduct = (text: string) => {
    const { claim, publicToken, transfer } = parseScannedQr(text);
    const token = publicToken ?? (PLAIN_CODE.test(text.trim()) ? text.trim() : null);
    if (token) {
      setMessage({ text: 'QR leído. Buscando el producto...', tone: 'info' });
      window.location.href = `/verify?token=${encodeURIComponent(token)}`;
      return;
    }
    setMessage({
      tone: 'error',
      text: claim
        ? 'Ese es el QR secreto de adentro de la caja: sirve para activar la garantía desde tu panel de Verifire. Para verificar el producto escaneá el QR de afuera.'
        : transfer
          ? 'Ese es un link de transferencia: abrilo desde tu panel de Verifire para aceptar el producto.'
          : 'No reconocimos ese QR como un QR de Verifire.'
    });
  };

  return (
    <div className="verify-scan">
      <p className="verify-scan-hint">Escaneá el QR de afuera de la caja con la cámara, subí una foto o pegá una captura con <kbd>Ctrl</kbd> + <kbd>V</kbd>.</p>
      <QrScanPanel onDetected={openProduct} onMessage={setMessage} onScanStart={() => setMessage(null)} />
      <Toast message={message} onClose={() => setMessage(null)} />
    </div>
  );
}
