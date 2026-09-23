// The public QR of a box, read with the camera, an uploaded image or a pasted screenshot (Ctrl+V): it opens the
// verification of that product, the same page the QR links to.
import { useState } from 'react';
import type { Message } from '@/components/ui/StatusMessage';
import { Toast } from '@/components/ui/Toast';
import { QrScanPanel } from '@/components/warranties/QrScanPanel';
import { getVerifyMessages } from '@/i18n/verify';
import type { Locale } from '@/lib/locale';
import { parseScannedQr } from '@/lib/qr-codes';

// A QR that holds only the code, without the link.
const PLAIN_CODE = /^[A-Z0-9][A-Z0-9-]{2,40}$/i;

export function VerifyScanner({ locale = 'es' }: { locale?: Locale }) {
  const [message, setMessage] = useState<Message | null>(null);
  const copy = getVerifyMessages(locale).scan;

  const openProduct = (text: string) => {
    const { claim, publicToken, transfer } = parseScannedQr(text);
    const token = publicToken ?? (PLAIN_CODE.test(text.trim()) ? text.trim() : null);
    if (token) {
      setMessage({ text: copy.searching, tone: 'info' });
      window.location.href = `/verify?token=${encodeURIComponent(token)}`;
      return;
    }
    setMessage({
      tone: 'error',
      text: claim ? copy.secretQr : transfer ? copy.transferLink : copy.unknown
    });
  };

  return (
    <div className="verify-scan">
      <p className="verify-scan-hint">{copy.hint} <kbd>Ctrl</kbd> + <kbd>V</kbd>.</p>
      <QrScanPanel locale={locale} onDetected={openProduct} onMessage={setMessage} onScanStart={() => setMessage(null)} />
      <Toast message={message} onClose={() => setMessage(null)} />
    </div>
  );
}
