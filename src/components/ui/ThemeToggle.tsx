import { useEffect, useState } from 'react';
import { currentTheme, setTheme, THEME_EVENT } from '@/lib/client/theme';
import { Icon } from './Icon';

// Light or dark, for the pages that have no profile menu to hold the switch. The choice is the same one the menu
// writes, so both stay in step.
export function ThemeToggle({ label = 'Modo oscuro' }: { label?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const follow = () => setDark(currentTheme() === 'dark');
    follow();
    window.addEventListener(THEME_EVENT, follow);
    return () => window.removeEventListener(THEME_EVENT, follow);
  }, []);

  return (
    <button
      className="lp-theme-toggle"
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={label}
      title={label}
      onClick={() => {
        setTheme(dark ? 'light' : 'dark');
        setDark(!dark);
      }}
    >
      <Icon name={dark ? 'fa-solid fa-moon' : 'fa-solid fa-sun'} />
    </button>
  );
}
