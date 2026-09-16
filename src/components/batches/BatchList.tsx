// Every batch this company emitted: search, ordering, labels to print or download, and live activation counters.
// The codes of a batch are fetched from the server only when it is opened, printed or downloaded.
import { useStore } from '@nanostores/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { StatusMessage, type Message } from '@/components/ui/StatusMessage';
import { ApiError } from '@/lib/client/api';
import { downloadBatchCsv, downloadDataUrl } from '@/lib/client/download';
import { fetchPurchase, forgetPurchase, migrateLegacyPurchase, savedPurchaseIds } from '@/lib/client/purchases';
import { userSession } from '@/lib/client/session';
import { errorMessage } from '@/lib/errors';
import { plural } from '@/lib/format';
import type { CompanyBatch } from '@/lib/types';
import { $purchaseIds, $summaries, isSummary, setSummary, type SummaryEntry } from '@/stores/batches';
import { BatchItem, type BatchAction } from './BatchItem';
import { LabelSheet, type QrKind } from './LabelSheet';
import { PaymentDetail } from './PaymentDetail';

const POLL_MS = 5000;
// Every 12 checks (about a minute) every batch is refreshed, not only the ones waiting for something.
const REFRESH_EVERY_TICKS = 12;

type SortKey = keyof typeof sorters;

type OpenDetail =
  | { purchaseId: string; state: 'payment' | 'loading' }
  | { purchaseId: string; state: 'ready'; batch: CompanyBatch }
  | { purchaseId: string; state: 'error'; message: string };

const createdAt = (summary: SummaryEntry | undefined) => (isSummary(summary) && summary.createdAt ? new Date(summary.createdAt).getTime() : 0);
const quantity = (summary: SummaryEntry | undefined) => (isSummary(summary) ? summary.quantity || 0 : 0);
const claimed = (summary: SummaryEntry | undefined) => (isSummary(summary) ? summary.claimed || 0 : 0);
const claimedRatio = (summary: SummaryEntry | undefined) => (quantity(summary) ? claimed(summary) / quantity(summary) : 0);

const sorters = {
  recent: (first: SummaryEntry | undefined, second: SummaryEntry | undefined) => createdAt(second) - createdAt(first),
  oldest: (first: SummaryEntry | undefined, second: SummaryEntry | undefined) => createdAt(first) - createdAt(second),
  'claimed-desc': (first: SummaryEntry | undefined, second: SummaryEntry | undefined) => claimedRatio(second) - claimedRatio(first) || claimed(second) - claimed(first),
  'claimed-asc': (first: SummaryEntry | undefined, second: SummaryEntry | undefined) => claimedRatio(first) - claimedRatio(second) || claimed(first) - claimed(second),
  'quantity-desc': (first: SummaryEntry | undefined, second: SummaryEntry | undefined) => quantity(second) - quantity(first),
  'quantity-asc': (first: SummaryEntry | undefined, second: SummaryEntry | undefined) => quantity(first) - quantity(second)
};

const SORT_OPTIONS: [SortKey, string][] = [
  ['recent', 'Fecha: más nuevos primero'],
  ['oldest', 'Fecha: más antiguos primero'],
  ['claimed-desc', 'Activaciones: de mayor a menor'],
  ['claimed-asc', 'Activaciones: de menor a mayor'],
  ['quantity-desc', 'Tokens: de mayor a menor'],
  ['quantity-asc', 'Tokens: de menor a mayor']
];

// Searches the labels of a batch: what the company knows it by.
const matchesSearch = (summary: SummaryEntry | undefined, query: string) => {
  if (!query) return true;
  if (!isSummary(summary)) return false;
  return [summary.batchId, summary.model, summary.lot, summary.destination]
    .some((label) => Boolean(label) && String(label).toLowerCase().includes(query));
};

const needsPolling = (summary: SummaryEntry | undefined) => isSummary(summary) && (!summary.batchId || summary.pendingOnChain > 0);

export function BatchList() {
  const purchaseIds = useStore($purchaseIds);
  const summaries = useStore($summaries);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [status, setStatus] = useState<Message | null>(null);
  const [open, setOpen] = useState<OpenDetail | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  // purchaseId -> batch with secret codes and QR images, loaded when first needed.
  const fullBatches = useRef(new Map<string, CompanyBatch>());
  const openId = useRef('');
  const items = useRef(new Map<string, HTMLElement>());
  const pollTimer = useRef<number | undefined>(undefined);
  const pollTicks = useRef(0);

  const visibleIds = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return purchaseIds
      .filter((purchaseId) => matchesSearch(summaries[purchaseId], normalizedQuery))
      .sort((first, second) => sorters[sort](summaries[first], summaries[second]));
  }, [purchaseIds, summaries, query, sort]);

  const loadFullBatch = async (purchaseId: string) => {
    const cached = fullBatches.current.get(purchaseId);
    if (cached) return cached;
    const data = await fetchPurchase(purchaseId);
    if (!data.succeeded || !data.batch) throw new Error('Este lote todavía no está listo: falta confirmar el pago.');
    fullBatches.current.set(purchaseId, data.batch);
    setSummary(purchaseId, data.purchase);
    return data.batch;
  };

  const refreshSummary = async (purchaseId: string) => {
    const previous = $summaries.get()[purchaseId];
    try {
      const { purchase } = await fetchPurchase(purchaseId, { summary: true });
      setSummary(purchaseId, purchase);
    } catch (error) {
      // A network hiccup keeps what was already shown; a purchase the server no longer has is marked.
      if (error instanceof ApiError && error.status === 404) setSummary(purchaseId, { error: 'Esta compra ya no existe en el servidor.' });
      else if (!isSummary(previous)) setSummary(purchaseId, { error: errorMessage(error) });
    }
  };

  // Purchases waiting for their payment or for Stellar are checked every POLL_MS; every batch once a minute, so the
  // activation counters follow what customers scan.
  const schedulePolling = () => {
    window.clearTimeout(pollTimer.current);
    if (!$purchaseIds.get().length) return;
    pollTimer.current = window.setTimeout(async () => {
      pollTicks.current += 1;
      const ids = $purchaseIds.get();
      const targets = pollTicks.current % REFRESH_EVERY_TICKS === 0 ? ids : ids.filter((purchaseId) => needsPolling($summaries.get()[purchaseId]));
      await Promise.all(targets.map(refreshSummary));
      schedulePolling();
    }, POLL_MS);
  };

  useEffect(() => {
    if (!userSession.isActive()) return undefined;
    migrateLegacyPurchase();
    const ids = savedPurchaseIds();
    $purchaseIds.set(ids);
    setLoaded(true);
    void Promise.all(ids.map(refreshSummary)).then(schedulePolling);
    return () => window.clearTimeout(pollTimer.current);
    // Runs once per page load; polling reads the stores directly.
  }, []);

  // Only one batch is open at a time, so printing prints only its labels.
  const openDetail = async (purchaseId: string) => {
    openId.current = purchaseId;
    const summary = $summaries.get()[purchaseId];
    if (isSummary(summary) && !summary.batchId) {
      setOpen({ purchaseId, state: 'payment' });
      return null;
    }
    const cached = fullBatches.current.get(purchaseId);
    if (cached) {
      setOpen({ purchaseId, state: 'ready', batch: cached });
      return cached;
    }
    setOpen({ purchaseId, state: 'loading' });
    try {
      const batch = await loadFullBatch(purchaseId);
      if (openId.current !== purchaseId) return null;
      setOpen({ purchaseId, state: 'ready', batch });
      return batch;
    } catch (error) {
      if (openId.current === purchaseId) setOpen({ purchaseId, state: 'error', message: errorMessage(error) });
      return null;
    }
  };

  const closeDetail = () => {
    openId.current = '';
    setOpen(null);
  };

  // A purchase paid while its payment QR is open shows its labels instead.
  const openSummary = open ? summaries[open.purchaseId] : undefined;
  useEffect(() => {
    if (open?.state === 'payment' && isSummary(openSummary) && openSummary.batchId) void openDetail(open.purchaseId);
  }, [open, openSummary]);

  const printBatch = async (purchaseId: string) => {
    const batch = await openDetail(purchaseId);
    if (!batch) return;
    // The labels must be in the page before the print dialog takes its snapshot.
    flushSync(() => setOpen({ purchaseId, state: 'ready', batch }));
    const images = Array.from(items.current.get(purchaseId)?.querySelectorAll<HTMLImageElement>('.label-sheet img') ?? []);
    await Promise.all(images.map((image) => image.decode().catch(() => {})));
    window.print();
  };

  const runBusy = async (key: string, task: () => Promise<void>) => {
    setBusy((current) => new Set(current).add(key));
    try {
      await task();
    } catch (error) {
      setStatus({ text: errorMessage(error), tone: 'error' });
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const handleAction = async (purchaseId: string, action: BatchAction) => {
    setStatus(null);
    switch (action) {
      case 'toggle':
        if (openId.current === purchaseId) closeDetail();
        else void openDetail(purchaseId);
        return;
      case 'forget': {
        const confirmed = window.confirm('¿Quitar esta compra de tu lista? Si ya la pagaste, el lote se genera igual, pero no lo vas a ver en este panel.');
        if (!confirmed) return;
        forgetPurchase(purchaseId);
        setSummary(purchaseId, undefined);
        fullBatches.current.delete(purchaseId);
        if (openId.current === purchaseId) closeDetail();
        $purchaseIds.set(savedPurchaseIds());
        return;
      }
      case 'retry':
        setSummary(purchaseId, undefined);
        await refreshSummary(purchaseId);
        schedulePolling();
        return;
      case 'print':
        await runBusy(`${purchaseId}:print`, () => printBatch(purchaseId));
        return;
      case 'csv':
        await runBusy(`${purchaseId}:csv`, async () => downloadBatchCsv(await loadFullBatch(purchaseId)));
        return;
      case 'lot-qr':
        await runBusy(`${purchaseId}:lot-qr`, async () => {
          const batch = await loadFullBatch(purchaseId);
          await downloadDataUrl(batch.publicQr, `${batch.batchId}-qr-publico-del-lote.svg`);
        });
        return;
    }
  };

  const downloadQr = (purchaseId: string, token: string, kind: QrKind) =>
    runBusy(`${purchaseId}:${token}:${kind}`, async () => {
      const label = (await loadFullBatch(purchaseId)).tokens.find((candidate) => candidate.token === token);
      if (label) await downloadDataUrl(kind === 'secret' ? label.secretQr : label.publicQr, `${label.token}-qr-${kind === 'secret' ? 'secreto' : 'publico'}.svg`);
    });

  const detailFor = (purchaseId: string, summary: SummaryEntry | undefined) => {
    if (open?.purchaseId !== purchaseId) return null;
    if (open.state === 'payment' && isSummary(summary)) return <PaymentDetail summary={summary} />;
    if (open.state === 'ready') {
      return (
        <LabelSheet
          batch={open.batch}
          isDownloading={(token, kind) => busy.has(`${purchaseId}:${token}:${kind}`)}
          onDownloadQr={(token, kind) => void downloadQr(purchaseId, token, kind)}
        />
      );
    }
    if (open.state === 'error') return <p className="batch-item-note is-error">{open.message}</p>;
    return <p className="batch-item-note">Cargando etiquetas...</p>;
  };

  const total = purchaseIds.length;

  return (
    <section className="vault" aria-labelledby="batch-list-title">
      <div className="vault-header">
        <h2 id="batch-list-title">Lotes</h2>
        <span className="vault-count">{total ? `${visibleIds.length} de ${total} ${plural(total, 'lote', 'lotes')}` : ''}</span>
      </div>

      <div className="batch-filters">
        <div className="batch-search">
          <Icon name="fa-solid fa-magnifying-glass" />
          <label className="visually-hidden" htmlFor="batch-search">Buscar lote</label>
          <input
            id="batch-search"
            type="search"
            placeholder="Buscar por modelo, lote, destino o número de lote"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <label className="visually-hidden" htmlFor="batch-sort">Ordenar lotes</label>
        <select id="batch-sort" value={sort} onChange={(event) => setSort(event.currentTarget.value as SortKey)}>
          {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <StatusMessage id="batches-status" message={status} />
      <div className="batch-list">
        {visibleIds.map((purchaseId) => (
          <BatchItem
            key={purchaseId}
            purchaseId={purchaseId}
            summary={summaries[purchaseId]}
            open={open?.purchaseId === purchaseId}
            detail={detailFor(purchaseId, summaries[purchaseId])}
            itemRef={(element) => {
              if (element) items.current.set(purchaseId, element);
              else items.current.delete(purchaseId);
            }}
            isBusy={(action) => busy.has(`${purchaseId}:${action}`)}
            onAction={(action) => void handleAction(purchaseId, action)}
          />
        ))}
      </div>
      <div className="vault-empty" hidden={!loaded || visibleIds.length > 0}>
        <p>
          {total
            ? 'Ningún lote coincide con la búsqueda. Probá con otro modelo, lote o destino.'
            : 'Todavía no emitiste lotes. Comprá tokens para generar tus primeras etiquetas.'}
        </p>
      </div>
    </section>
  );
}
