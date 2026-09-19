// Light or dark look, chosen in the profile menu and kept in this browser. BaseLayout applies it inline in <head>,
// before the page is painted, so a dark page never flashes white.
export const THEME_KEY = 'verifireTheme';

export type Theme = 'light' | 'dark';

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export const setTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Without storage the choice lasts until the page changes.
  }
};
