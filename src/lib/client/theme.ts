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

export const setTheme = (preference: ThemePreference) => {
  document.documentElement.dataset.theme = preference === 'system' ? systemTheme() : preference;
  window.dispatchEvent(new CustomEvent(THEME_EVENT));
  // Without storage the choice lasts until the page changes.
  writeRaw(localStorage, THEME_KEY, preference);
};

export const motionEnabled = () => readRaw(localStorage, MOTION_KEY) !== 'off';

export const setMotionEnabled = (enabled: boolean) => {
  if (enabled) delete document.documentElement.dataset.motion;
  else document.documentElement.dataset.motion = 'off';
  writeRaw(localStorage, MOTION_KEY, enabled ? 'on' : 'off');
};
