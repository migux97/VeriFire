import { IssuanceConfigurator } from './IssuanceConfigurator';
// Company purchase: pay a batch of tokens with Cosmos Pay. Once the payment is confirmed the batch, its labels and its
// activation counters live in Mis lotes; this form only creates the purchase and follows its payment.
import { useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { PaymentWarning } from '@/components/ui/PaymentWarning';
import type { Message } from '@/components/ui/StatusMessage';
import { Toast } from '@/components/ui/Toast';
import { postJson } from '@/lib/client/api';
import { fetchPurchase, migrateLegacyPurchase, savePurchase } from '@/lib/client/purchases';
import { userSession } from '@/lib/client/session';
import { errorMessage } from '@/lib/errors';
import { plural } from '@/lib/format';
import type { CountryOption, CreatedPurchase } from '@/lib/types';

const POLL_MS = 4000;
const WAITING_FOR_PAYMENT = 'Esperando confirmación de Cosmos Pay...';

interface PurchaseFormProps {
  countries: CountryOption[];
  batchesHref?: string;
  embedded?: boolean;
  pricePerToken?: string;
}

// LATAM first, the rest in alphabetical order.
const groupByRegion = (countries: CountryOption[]) => {
  const regions = new Map<string, CountryOption[]>();
  countries.forEach((country) => regions.set(country.region, [...(regions.get(country.region) ?? []), country]));
  return [...regions.entries()].sort(([first], [second]) => (first === 'LATAM' ? -1 : second === 'LATAM' ? 1 : first.localeCompare(second, 'es')));
};

export function PurchaseForm({ countries, batchesHref = '/batches', embedded = false, pricePerToken }: PurchaseFormProps) {
  const [message, setMessage] = useState<Message | null>(null);
  const [payment, setPayment] = useState<CreatedPurchase | null>(null);
  const [paymentStatus, setPaymentStatus] = useState(WAITING_FOR_PAYMENT);
  const [submitting, setSubmitting] = useState(false);
  const [batchReady, setBatchReady] = useState(false);
  const [country, setCountry] = useState('');
  const purchaseId = useRef('');
  const pollTimer = useRef<number | undefined>(undefined);
  // Set when the form closes: a poll that was mid-request must not schedule the next one.
  const stopped = useRef(false);
  const regions = useMemo(() => groupByRegion(countries), [countries]);
  // Printed on the labels ("Argentina · LATAM"), as the server composes it.
  const destination = countries.find((option) => option.code === country)?.destination;

  useEffect(() => {
    if (userSession.isActive()) migrateLegacyPurchase();
    return () => {
      stopped.current = true;
      window.clearTimeout(pollTimer.current);
    };
  }, []);

  const pollPurchase = async () => {
    const polled = purchaseId.current;
    pollTimer.current = undefined;
    try {
      const data = await fetchPurchase(polled, { summary: true });
      // Ignore an answer for a purchase that was already replaced by a newer one.
      if (polled !== purchaseId.current) return;
      if (data.succeeded && data.purchase.batchId) {
        purchaseId.current = '';
        setPayment(null);
        setBatchReady(true);
        setMessage({ text: `Pago confirmado. El lote ${data.purchase.batchId} ya está en Mis lotes con sus etiquetas.`, tone: 'success' });
        return;
      }
      setPaymentStatus(data.succeeded
        ? 'Pago confirmado. Preparando los tokens...'
        : `Estado Cosmos Pay: ${data.status || 'pendiente'}. Comprobando automáticamente...`);
    } catch (error) {
      if (polled !== purchaseId.current) return;
      setPaymentStatus(errorMessage(error));
    }
    if (!stopped.current) pollTimer.current = window.setTimeout(() => void pollPurchase(), POLL_MS);
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSubmitting(true);
    window.clearTimeout(pollTimer.current);
    purchaseId.current = '';
    setBatchReady(false);
    setMessage({ text: 'Creando el pago en Cosmos Pay...', tone: 'info' });
    try {
      const purchase = await postJson<CreatedPurchase>('/api/purchases', {
        model: String(formData.get('model') ?? '').trim(),
        lot: String(formData.get('lot') ?? '').trim(),
        country: String(formData.get('country') ?? ''),
        quantity: Number(formData.get('quantity')),
        ...(formData.get('configuration') ? { configuration: JSON.parse(String(formData.get('configuration'))) } : {})
      }, 'No se pudo crear el pago del lote.');

      // Saved right away: the purchase is already in Mis lotes, even if this page is closed before paying.
      savePurchase(purchase.purchaseId);
      purchaseId.current = purchase.purchaseId;
      form.reset();
      setCountry('');
      setMessage(null);
      setPayment(purchase);
      setPaymentStatus(WAITING_FOR_PAYMENT);
      void pollPurchase();
    } catch (error) {
      setMessage({ text: errorMessage(error), tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {embedded ? (!(payment || batchReady) && <IssuanceConfigurator pricePerToken={pricePerToken} countries={countries} submitting={submitting} onSubmit={(event) => void handleSubmit(event)} />) : <form className="claim-form" hidden={embedded && (Boolean(payment) || batchReady)} onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="product-model">Modelo del producto</label>
        <input id="product-model" name="model" placeholder="Ej. Zapatilla Runner X" maxLength={120} required />
        <label htmlFor="product-lot">Lote de fabricación</label>
        <input id="product-lot" name="lot" placeholder="Ej. 1043" maxLength={60} required />
        <label htmlFor="product-country">País de destino</label>
        <select
          id="product-country"
          name="country"
          aria-describedby="destination-preview"
          required
          value={country}
          onChange={(event) => setCountry(event.currentTarget.value)}
        >
          <option value="">Elegí el país de destino</option>
          {regions.map(([region, regionCountries]) => (
            <optgroup key={region} label={region}>
              {regionCountries.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
            </optgroup>
          ))}
        </select>
        <p id="destination-preview" className="field-hint">
          {destination ? `En las etiquetas va a figurar: ${destination}` : 'La región se completa sola según el país que elijas.'}
        </p>
        <label htmlFor="token-quantity">Cantidad de tokens</label>
        <input id="token-quantity" name="quantity" type="number" min={1} max={500} defaultValue={3} required />
        <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? 'Preparando pago…' : embedded ? 'Continuar al pago' : 'Generar lote y pagar'}</button>
      </form>}

      {payment && (
        <div className="verify-details is-available">
          <strong>Pagá {payment.amount} {payment.asset || 'XLM'} para emitir {payment.quantity} {plural(payment.quantity, 'token', 'tokens')}</strong>
          <span>Escaneá el QR con Cosmos Pay. El lote se genera solo cuando se confirma el pago.</span>
          <PaymentWarning as="span" />
          {payment.qr && <img src={payment.qr} alt="QR de pago Cosmos Pay" width={240} height={240} />}
          <span role="status">{paymentStatus}</span>
        </div>
      )}
      {embedded && (payment || batchReady) && <div className="company-payment-actions">
        {batchReady ? <p role="status">Pago confirmado. Tu lote ya está listo en Mis lotes.</p> : <p>Podés cambiar de pestaña: el pago pendiente queda guardado en Mis lotes.</p>}
        <button className="button button-secondary" type="button" onClick={() => {
          window.clearTimeout(pollTimer.current);
          purchaseId.current = '';
          setPayment(null);
          setBatchReady(false);
          setMessage(null);
        }}>Crear otro lote</button>
        {payment && <a className="button button-secondary" href={batchesHref}>Ver pagos y lotes</a>}
      </div>}
      <Toast message={message} onClose={() => setMessage(null)} />
      <a className="button button-secondary" href={batchesHref} hidden={!batchReady}><Icon name="fa-solid fa-boxes-stacked" /> Ver mis lotes</a>
    </>
  );
}
