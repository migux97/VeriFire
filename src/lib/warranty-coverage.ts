const DAY_MS = 86_400_000;

// Use timestamps for the bar; round only the human-readable day counts.
export function warrantyCoverage(start: string | null, end: string | null, now: number) {
  const from = start ? Date.parse(start) : NaN;
  const until = end ? Date.parse(end) : NaN;
  if (!Number.isFinite(from) || !Number.isFinite(until) || !Number.isFinite(now) || until <= from) return null;
  const duration = until - from;
  const remaining = Math.max(0, Math.min(duration, until - now));
  return {
    state: now < from ? 'pending' as const : now >= until ? 'expired' as const : 'active' as const,
    totalDays: Math.ceil(duration / DAY_MS),
    remainingDays: Math.ceil(remaining / DAY_MS),
    percent: remaining / duration * 100
  };
}
