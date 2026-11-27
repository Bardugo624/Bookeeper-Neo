import { useEffect } from 'react';

const QUERY = '(prefers-color-scheme: dark)';

/** `html.dark` follows the system, and its changes. `forced` pins it (the dark preview scenario). */
export function useTheme(forced?: 'dark'): void {
  useEffect(() => {
    const root = document.documentElement;
    if (forced === 'dark') {
      root.classList.add('dark');
      return;
    }
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(QUERY);
    const apply = () => root.classList.toggle('dark', query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [forced]);
}
