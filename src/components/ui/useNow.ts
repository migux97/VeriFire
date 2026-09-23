import { useEffect, useState } from 'react';

// The current time, updated every second while `active`, for countdowns.
export function useNow(active: boolean, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, intervalMs);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [active, intervalMs]);

  return now;
}
