export type Theme = 'light' | 'dark' | 'system';

export const THEME_KEY = 'bookeeper.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // Storage unavailable: fall through to the default.
  }
  return 'system';
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The choice still applies for this run.
  }
}

export function systemQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
}

/** Puts or removes the `dark` class on `<html>`. */
export function applyTheme(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && (systemQuery()?.matches ?? false));
  document.documentElement.classList.toggle('dark', dark);
}
