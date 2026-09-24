import { useEffect, useState } from 'react';
import { currentTheme, setTheme, THEME_EVENT } from '@/lib/client/theme';

// Light or dark, in the headers. The choice is the same one the profile menu and the settings write, so every switch
// stays in step. The new look spreads in a circle from the button (see setTheme) while the sun turns into the moon.
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
      data-dark={dark ? '' : undefined}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        setTheme(dark ? 'light' : 'dark', { x: box.left + box.width / 2, y: box.top + box.height / 2 });
        setDark(!dark);
      }}
    >
      <span className="theme-toggle-icons" aria-hidden="true">
        <i className="fa-solid fa-sun theme-toggle-sun" />
        <i className="fa-solid fa-moon theme-toggle-moon" />
      </span>
    </button>
  );
}
