// TEMPORARY: demo mode of the company panel, turned on from Configuración. It fills the account with sample purchases,
// batches, agenda, team and notifications so the charts and the editing can be tried without paying real batches.
// Everything it writes goes under the account's demo keys (see accountKey in session.ts) and is wiped when it is turned
// off. To remove the feature: delete this file, the demo branches marked "TEMPORARY demo" in purchases.ts, the demo
// section of CompanySettings, CompanyDemoBanner and the demo helpers in session.ts.
import type { CompanyBatch, CreatedPurchase, ProductLabel, PurchaseStatus, PurchaseSummary } from '../types';
import { companyMessages } from '../../i18n/company';
import { toLocale } from '../locale';
import { notify } from './notifications';
import { writeSchedules, type ScheduleItem } from './schedules';
import { accountKey, demoAccountKeys, demoFlagKey, demoModeActive } from './session';
import { readStored, removeStored, writeRaw, writeStored } from './storage';
import { storedUser } from './account';

const PRICE_PER_TOKEN = 5;
// A new demo purchase is "paid" on its own after this long, so its payment and batch notifications can be seen.
const DEMO_PAYMENT_DELAY_MS = 12_000;
const DEMO_PREFIX = 'DEMO-PUR-';

interface DemoPurchase {
  purchaseId: string;
  batchId: string;
  model: string;
  lot: string;
  destination: string;
  quantity: number;
  createdAt: string;
  // Null while it waits for a payment that never comes; a future date for one that is confirmed on its own.
  paidAt: string | null;
  claimed: number;
  shippedAt: string | null;
  brand: string;
  labelStyle: 'standard' | 'compact';
}

interface DemoState {
  next: number;
  purchases: DemoPurchase[];
}

export const isDemoPurchase = (purchaseId: string) => purchaseId.startsWith(DEMO_PREFIX);

const stateKey = () => accountKey('demo-purchases');
const readState = (): DemoState => readStored<DemoState>(localStorage, stateKey()) ?? { next: 1, purchases: [] };
const writeState = (state: DemoState) => writeStored(localStorage, stateKey(), state);

const messages = () => companyMessages(toLocale(document.documentElement.lang) ?? 'es');

const qrImage = async (text: string) => (await import('qrcode')).toDataURL(text, { margin: 1, width: 240 });

// The sample QR images are made the first time something shows them, not when demo mode is turned on, so turning it
// on writes everything at once and never waits for the QR library.
let labelQr: Promise<string> | null = null;
const demoLabelQr = () => (labelQr ??= qrImage(messages().demo.labelQr));
let paymentQrImage: Promise<string> | null = null;
const demoPaymentQr = () => (paymentQrImage ??= qrImage(messages().demo.paymentQr));

const isPaid = (purchase: DemoPurchase, now = Date.now()) => purchase.paidAt !== null && Date.parse(purchase.paidAt) <= now;

const summaryOf = (purchase: DemoPurchase, now = Date.now()): PurchaseSummary => {
  const paid = isPaid(purchase, now);
  return {
    purchaseId: purchase.purchaseId,
    model: purchase.model,
    lot: purchase.lot,
    destination: purchase.destination,
    quantity: purchase.quantity,
    amount: String(purchase.quantity * PRICE_PER_TOKEN),
    asset: 'XLM',
    createdAt: purchase.createdAt,
    batchId: paid ? purchase.batchId : null,
    payment: paid ? null : { qr: null, uri: null },
    issuanceTxUrl: null,
    // Sample batches are not on Stellar, so they never claim to be.
    registeredOnChain: 0,
    pendingOnChain: 0,
    claimed: paid ? purchase.claimed : 0,
    shippedAt: purchase.shippedAt
  };
};

const statusOf = (purchase: DemoPurchase): PurchaseStatus => {
  const summary = summaryOf(purchase);
  return summary.batchId
    ? { status: 'succeeded', succeeded: true, paymentValidated: true, purchase: summary }
    : { status: 'pending', succeeded: false, purchase: summary };
};

const find = (purchaseId: string) => {
  const purchase = readState().purchases.find((item) => item.purchaseId === purchaseId);
  if (!purchase) throw new Error(messages().batches.gone);
  return purchase;
};

// Answers slowly enough to show the panel's loading states, like the real server.
const later = <T>(value: () => T) => new Promise<T>((resolve, reject) => window.setTimeout(() => {
  try {
    resolve(value());
  } catch (error) {
    reject(error);
  }
}, 250));

export const demoPurchaseIds = () =>
  [...readState().purchases].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map((purchase) => purchase.purchaseId);

// A purchase waiting for its payment carries the sample payment QR, like the real one carries Cosmos Pay's.
const withPaymentQr = async (status: PurchaseStatus): Promise<PurchaseStatus> =>
  status.purchase.payment ? { ...status, purchase: { ...status.purchase, payment: { qr: await demoPaymentQr(), uri: null } } } as PurchaseStatus : status;

export const demoPurchase = async (purchaseId: string) => withPaymentQr(await later(() => statusOf(find(purchaseId))));

export const demoPurchaseDetail = async (purchaseId: string): Promise<PurchaseStatus> => {
  const purchase = find(purchaseId);
  const status = statusOf(purchase);
  if (!status.succeeded) return withPaymentQr(await later(() => status));
  const image = await demoLabelQr();
  const tokens: ProductLabel[] = Array.from({ length: purchase.quantity }, (_, index) => ({
    token: `${purchase.lot}-${String(index + 1).padStart(3, '0')}`,
    status: index < purchase.claimed ? 'CLAIMED_IN_WARRANTY' : 'SEALED',
    secretCode: 'DEMO-SIN-VALIDEZ',
    secretUrl: '',
    secretQr: image,
    publicUrl: '',
    publicQr: image
  }));
  const batch: CompanyBatch = {
    batchId: purchase.batchId,
    quantity: purchase.quantity,
    model: purchase.model,
    lot: purchase.lot,
    destination: purchase.destination,
    publicUrl: '',
    network: 'DEMO',
    blockchainBacked: false,
    configuration: { brand: purchase.brand, labelText: '', labelStyle: purchase.labelStyle },
    publicQr: image,
    tokens,
    payment: { amount: String(purchase.quantity * PRICE_PER_TOKEN), asset: 'XLM', pricePerToken: String(PRICE_PER_TOKEN) }
  };
  return later(() => ({ ...status, batch }));
};

export interface DemoPurchaseRequest {
  model: string;
  lot: string;
  quantity: number;
  destination: string;
  configuration?: { brand?: string; labelStyle?: 'standard' | 'compact' };
}

export const createDemoPurchase = async (request: DemoPurchaseRequest): Promise<CreatedPurchase> => {
  // The QR first: reading the state before this wait let two quick purchases get the same number, the second one
  // overwriting the first.
  const paymentQr = await demoPaymentQr();
  const state = readState();
  const number = state.next;
  const now = Date.now();
  const purchase: DemoPurchase = {
    purchaseId: `${DEMO_PREFIX}${number}`,
    batchId: `DEMO-BATCH-${String(number).padStart(4, '0')}`,
    model: request.model,
    lot: request.lot,
    destination: request.destination,
    quantity: request.quantity,
    createdAt: new Date(now).toISOString(),
    paidAt: new Date(now + DEMO_PAYMENT_DELAY_MS).toISOString(),
    claimed: 0,
    shippedAt: null,
    brand: request.configuration?.brand || storedUser()?.companyName || 'Verifire Demo',
    labelStyle: request.configuration?.labelStyle ?? 'standard'
  };
  writeState({ next: number + 1, purchases: [purchase, ...state.purchases] });
  return {
    purchaseId: purchase.purchaseId,
    quantity: purchase.quantity,
    amount: String(purchase.quantity * PRICE_PER_TOKEN),
    asset: 'XLM',
    intentId: purchase.purchaseId,
    status: 'pending',
    network: 'DEMO',
    uri: '',
    qr: paymentQr
  };
};

export const shipDemoPurchase = (purchaseId: string) =>
  later(() => {
    const state = readState();
    const purchases = state.purchases.map((item) => (item.purchaseId === purchaseId ? { ...item, shippedAt: new Date().toISOString() } : item));
    writeState({ ...state, purchases });
    return { purchase: summaryOf(find(purchaseId)) };
  });

export const forgetDemoPurchase = (purchaseId: string) => {
  const state = readState();
  writeState({ ...state, purchases: state.purchases.filter((item) => item.purchaseId !== purchaseId) });
};

// ---------- Sample data ----------

const daysAgo = (days: number, hour = 11) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

const localDateTime = (offsetMs: number) => {
  const date = new Date(Date.now() + offsetMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const HOUR = 60 * 60 * 1000;

const seed = () => {
  const user = storedUser();
  const brand = user?.companyName || 'Verifire Demo';
  const rows: [string, string, string, number, string, number | null][] = [
    ['Auriculares Pulse ANC', 'PUL-1040', 'Argentina · LATAM', 120, daysAgo(160), 108],
    ['Perfume Épure 50 ml', 'EPU-1041', 'Uruguay · LATAM', 180, daysAgo(128), 144],
    ['Reloj Atlas Automatic', 'ATL-1042', 'Chile · LATAM', 240, daysAgo(96), 180],
    ['Vino Reserva Malbec', 'MAL-1043', 'Argentina · LATAM', 160, daysAgo(64), 96],
    ['Pastillas de freno Original', 'REP-1044', 'Brasil · LATAM', 300, daysAgo(33), 150],
    ['Sérum Esencial 30 ml', 'COS-1045', 'México · LATAM', 200, daysAgo(6), 72],
    ['Auriculares Pulse ANC', 'PUL-1046', 'Perú · LATAM', 100, daysAgo(2), null],
    ['Reloj Atlas Automatic', 'ATL-1047', 'Colombia · LATAM', 80, daysAgo(0, new Date().getHours()), null]
  ];
  const purchases: DemoPurchase[] = rows.map(([model, lot, destination, quantity, createdAt, claimed], index) => ({
    purchaseId: `${DEMO_PREFIX}${index + 1}`,
    batchId: `DEMO-BATCH-${String(index + 1).padStart(4, '0')}`,
    model,
    lot,
    destination,
    quantity,
    createdAt,
    paidAt: claimed === null ? null : createdAt,
    claimed: claimed ?? 0,
    shippedAt: index < 3 ? daysAgo(150 - index * 32) : null,
    brand,
    labelStyle: index % 3 === 2 ? 'compact' : 'standard'
  }));
  writeState({ next: purchases.length + 1, purchases });
  // Known states, so only what changes from now on is notified.
  writeStored(
    localStorage,
    accountKey('purchase-states'),
    Object.fromEntries(purchases.map((purchase) => [purchase.purchaseId, { paid: purchase.paidAt !== null, batch: purchase.paidAt !== null }]))
  );

  const schedules: ScheduleItem[] = [
    { id: 'demo-payment-1', type: 'payment', title: 'Pago a proveedor de empaques', detail: '350 XLM · Factura A-0042', date: localDateTime(20 * HOUR) },
    { id: 'demo-batch-1', type: 'batch', title: 'Perfume Épure 50 ml · 150 unidades', detail: 'Referencia: EPU-1048 · Destino: Uruguay', date: localDateTime(2 * 24 * HOUR) },
    { id: 'demo-payment-2', type: 'payment', title: 'Cuota de producción', detail: '1200 XLM · Planta Córdoba', date: localDateTime(5 * 24 * HOUR) },
    { id: 'demo-payment-3', type: 'payment', title: 'Renovación de etiquetas', detail: '90 XLM · Imprenta', date: localDateTime(-2 * HOUR) }
  ];
  writeSchedules(schedules);

  const email = user?.email ?? '';
  writeStored(localStorage, accountKey('company-team'), [
    { id: 'owner', name: user?.name ?? 'Admin', email, role: 'admin', status: 'active' },
    { id: 'demo-1', name: 'Lucía Fernández', email: 'lucia.fernandez@demo.verifire', role: 'operator', status: 'active' },
    { id: 'demo-2', name: 'Martín Gómez', email: 'martin.gomez@demo.verifire', role: 'auditor', status: 'active' },
    { id: 'demo-3', name: 'carla.ruiz', email: 'carla.ruiz@demo.verifire', role: 'viewer', status: 'pending' }
  ]);

  const [first, second] = purchases.slice(4, 6);
  if (first) notify({ id: `demo:paid:${first.purchaseId}`, kind: 'paymentSucceeded', params: { amount: String(first.quantity * PRICE_PER_TOKEN), model: first.model }, href: '#batches', read: true, at: first.createdAt, quiet: true });
  if (first) notify({ id: `demo:batch:${first.purchaseId}`, kind: 'batchCreated', params: { batchId: first.batchId, model: first.model, quantity: String(first.quantity) }, href: '#batches', read: true, at: first.createdAt, quiet: true });
  if (second) notify({ id: `demo:batch:${second.purchaseId}`, kind: 'batchCreated', params: { batchId: second.batchId, model: second.model, quantity: String(second.quantity) }, href: '#batches', at: second.createdAt, quiet: true });
  notify({ id: 'demo:on', kind: 'demo', href: '#settings', quiet: true });
};

const wipe = () => demoAccountKeys().forEach((key) => removeStored(localStorage, key));

export const demoActive = demoModeActive;

// Synchronous on purpose: the flag and every sample record are written in the same task, so nothing (a reload, a
// closed tab) can leave demo mode on with half of its data.
export const enableDemo = () => {
  writeRaw(localStorage, demoFlagKey(), '1');
  wipe();
  seed();
};

export const resetDemo = enableDemo;

export const disableDemo = () => {
  wipe();
  removeStored(localStorage, demoFlagKey());
};
