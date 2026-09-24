// Look of the pages, chosen in the header, the profile menu or the company settings and kept in this browser.
// BaseLayout applies both choices inline in <head>, before the page is painted, so a dark page never flashes white and
// a panel with its animations turned off never plays the first one.
import { readRaw, writeRaw } from './storage';

export const THEME_KEY = 'verifireTheme';
// 'off' turns off the company panel's animations; anything else leaves them on (they still follow the system's
// reduced-motion setting, see global.css).
export const MOTION_KEY = 'verifireMotion';

// Announced so every switch on the page shows the same state.
export const THEME_EVENT = 'verifire:theme';

export type Theme = 'light' | 'dark';
// 'system' follows the operating system's light or dark setting.
export type ThemePreference = Theme | 'system';

const systemTheme = (): Theme => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export const themePreference = (): ThemePreference => {
  const saved = readRaw(localStorage, THEME_KEY);
  return saved === 'dark' || saved === 'system' ? saved : 'light';
};

const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new CustomEvent(THEME_EVENT));
};

// Where the switch was touched: the new look spreads in a circle from there. Without it, from the top of the page.
export interface ThemeOrigin {
  x: number;
  y: number;
}

// In the company panel the change is animated with a view transition, when the browser has them and the person has not
// turned animations off (the panel's switch or the system's reduced motion): a snapshot of the page in the new theme is
// revealed in a growing circle over the old one. Everywhere else it changes at once.
export const setTheme = (preference: ThemePreference, origin?: ThemeOrigin) => {
  const next = preference === 'system' ? systemTheme() : preference;
  // Without storage the choice lasts until the page changes.
  writeRaw(localStorage, THEME_KEY, preference);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const start = (document as Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } }).startViewTransition;
  const companyPanel = Boolean(document.querySelector('.company-shell'));
  if (next === currentTheme() || !companyPanel || !start || reduced || !motionEnabled()) {
    applyTheme(next);
    return;
  }
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? 0;
  // Far enough to cover the farthest corner of the window.
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = start.call(document, () => applyTheme(next));
  void transition.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 650, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    })
    .catch(() => {
      // An interrupted transition still leaves the new theme applied.
    });
};

export const motionEnabled = () => readRaw(localStorage, MOTION_KEY) !== 'off';

export const setMotionEnabled = (enabled: boolean) => {
  if (enabled) delete document.documentElement.dataset.motion;
  else document.documentElement.dataset.motion = 'off';
  writeRaw(localStorage, MOTION_KEY, enabled ? 'on' : 'off');
};
