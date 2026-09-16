import { useCallback, useEffect, useState } from 'react';

const COOLDOWN_KEY = 'verifireOtpCooldownUntil';
// Cavos rejects a new code request within 60 seconds of the previous one.
const RESEND_COOLDOWN_MS = 60 * 1000;

const storedCooldownEnd = () => Number(sessionStorage.getItem(COOLDOWN_KEY) || 0);

// Seconds until another code can be requested. Kept in sessionStorage, so a reload keeps the countdown.
export function useResendCooldown() {
  const [endsAt, setEndsAt] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    setEndsAt(storedCooldownEnd());
  }, []);

  useEffect(() => {
    const update = () => {
      const remainingMs = endsAt - Date.now();
      if (remainingMs <= 0) {
        setRemainingSeconds(0);
        if (endsAt) sessionStorage.removeItem(COOLDOWN_KEY);
        return false;
      }
      setRemainingSeconds(Math.ceil(remainingMs / 1000));
      return true;
    };
    if (!update()) return undefined;
    const timer = window.setInterval(() => {
      if (!update()) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  const start = useCallback(() => {
    const next = Date.now() + RESEND_COOLDOWN_MS;
    sessionStorage.setItem(COOLDOWN_KEY, String(next));
    setEndsAt(next);
  }, []);

  const label = remainingSeconds > 0
    ? `Reenviar código en ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`
    : 'Reenviar código';

  return { waiting: remainingSeconds > 0, label, start, isWaiting: () => storedCooldownEnd() > Date.now() };
}
