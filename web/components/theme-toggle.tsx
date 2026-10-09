'use client';

// Dark mode for the app pages only. Light is the default; the choice is not stored
// (the only thing Tapebook keeps in the browser is a pending counterexample).
import { Moon, Sun } from 'lucide-react';
import { useEffect } from 'react';
import { useDarkTheme } from '@/lib/hooks';

export function ThemeToggle() {
  const dark = useDarkTheme();
  return (
    <button
      className="btn btn-ghost"
      aria-label={dark ? 'Light theme' : 'Dark theme'}
      onClick={() => {
        if (!dark) document.documentElement.dataset.theme = 'dark';
        else delete document.documentElement.dataset.theme;
      }}
    >
      {dark ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}

/** The landing page is designed for light only: drop any data-theme attribute. */
export function ForceLight() {
  useEffect(() => {
    delete document.documentElement.dataset.theme;
  }, []);
  return null;
}
