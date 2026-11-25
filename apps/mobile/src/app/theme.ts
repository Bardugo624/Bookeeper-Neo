import { useEffect } from 'react';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Puts the `dark` class on `<html>` while the phone is in dark mode, and follows the setting. */
export function useSystemTheme(): void {
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DARK_QUERY);
    const apply = () => document.documentElement.classList.toggle('dark', query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
}
