import { useEffect } from 'react';
import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_KEY = 'bookeeper.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'system' || v === 'light' || v === 'dark') return v;
  } catch {
    // Storage unavailable: fall through to the default.
  }
  return 'system';
}

interface ThemeState {
  value: ThemePreference;
  set(value: ThemePreference): void;
}

const useThemeStore = create<ThemeState>((set) => ({
  value: readPreference(),
  set(value) {
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {
      // The choice still applies for this run.
    }
    applyTheme(value);
    set({ value });
  },
}));

function systemQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
}

/** Puts or removes the `dark` class on `<html>`. */
function applyTheme(value: ThemePreference): void {
  const dark = value === 'dark' || (value === 'system' && (systemQuery()?.matches ?? false));
  document.documentElement.classList.toggle('dark', dark);
}

/** The stored theme choice (`system` follows the phone) and its setter. */
export function useThemePreference(): ThemeState {
  return useThemeStore();
}

/** Applies the stored choice to `<html>` and, while it is `system`, follows the phone. */
export function useTheme(): void {
  const value = useThemeStore((s) => s.value);
  useEffect(() => {
    applyTheme(value);
    if (value !== 'system') return;
    const query = systemQuery();
    if (!query) return;
    const onChange = () => applyTheme('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [value]);
}

/** Test hook: re-reads the stored choice. */
export function resetThemePreferenceForTest(): void {
  useThemeStore.setState({ value: readPreference() });
}
