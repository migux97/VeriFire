// The company's batches, shared by the stats and the list of the Mis lotes page, which hydrate as separate islands.
import { atom, computed } from 'nanostores';
import type { PurchaseSummary } from '@/lib/types';

// A summary from the server (no secrets), or why it could not be loaded.
export type SummaryEntry = PurchaseSummary | { error: string };

export const isSummary = (entry: SummaryEntry | undefined): entry is PurchaseSummary => Boolean(entry) && !('error' in (entry as object));

// Purchases saved in this browser, newest first (see src/lib/client/purchases.ts).
export const $purchaseIds = atom<string[]>([]);

export const $summaries = atom<Record<string, SummaryEntry>>({});

// True once the list of batches answered its first round, so the company overview can tell "loading" from "empty".
export const $summariesReady = atom(false);

export const setSummary = (purchaseId: string, entry: SummaryEntry | undefined) => {
  const next = { ...$summaries.get() };
  if (entry) next[purchaseId] = entry;
  else delete next[purchaseId];
  $summaries.set(next);
};

export const $batchStats = computed([$purchaseIds, $summaries], (ids, summaries) => {
  const batches = ids.map((purchaseId) => summaries[purchaseId]).filter((entry) => isSummary(entry) && Boolean(entry.batchId)) as PurchaseSummary[];
  const tokens = batches.reduce((total, summary) => total + (Number(summary.quantity) || 0), 0);
  const claimed = batches.reduce((total, summary) => total + (Number(summary.claimed) || 0), 0);

  // The most claimed product adds up every batch of the same model.
  const byModel = new Map<string, { claimed: number; quantity: number }>();
  batches.forEach((summary) => {
    const entry = byModel.get(summary.model) ?? { claimed: 0, quantity: 0 };
    entry.claimed += Number(summary.claimed) || 0;
    entry.quantity += Number(summary.quantity) || 0;
    byModel.set(summary.model, entry);
  });
  const [topModel] = [...byModel.entries()].sort((first, second) => second[1].claimed - first[1].claimed);

  return {
    batchCount: batches.length,
    tokens,
    claimed,
    percent: tokens ? Math.round((claimed / tokens) * 100) : 0,
    topModel: topModel && topModel[1].claimed ? { model: topModel[0], ...topModel[1] } : null
  };
});
