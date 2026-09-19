const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const monthName = (date: Date) => (MONTHS[date.getMonth()] ?? '').replace(/^./, (letter) => letter.toUpperCase());

// "16 de Septiembre, 2026"
export const formatDay = (iso: string) => {
  const date = new Date(iso);
  return `${date.getDate()} de ${monthName(date)}, ${date.getFullYear()}`;
};

// "Septiembre 2027"
export const formatMonth = (iso: string) => {
  const date = new Date(iso);
  return `${monthName(date)} ${date.getFullYear()}`;
};

// "16 de septiembre de 2026". Pages rendered on the server pass UTC, and the browser rewrites it in its own time zone
// (see LocalDates.astro).
export const formatLongDate = (iso: string, timeZone?: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', ...(timeZone ? { timeZone } : {}) });

// "16 sept 2026"
export const shortDate = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

// "4:05": minutes and seconds left until a moment, never below zero.
export const formatCountdown = (until: string, now: number) => {
  const seconds = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export const plural = (count: number, singular: string, pluralForm: string) => (count === 1 ? singular : pluralForm);
