import { useEffect } from 'react';
import { create } from 'zustand';
import { applyTheme, readTheme, saveTheme, systemQuery, type Theme } from './theme';

interface ThemeState {
  theme: Theme;
  setTheme(theme: Theme): void;
}

const useThemeStore = create<ThemeState>((set) => ({
  theme: readTheme(),
  setTheme(theme) {
    saveTheme(theme);
    applyTheme(theme);
    set({ theme });
  },
}));

/** Current theme choice. Applies it, and follows the system setting while it is `system`. */
export function useTheme(): ThemeState {
  const state = useThemeStore();
  const { theme } = state;
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const query = systemQuery();
    if (!query) return;
    const onChange = () => applyTheme('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme]);
  return state;
}

/** Test hook: re-reads the stored choice. */
export function resetThemeForTest(): void {
  useThemeStore.setState({ theme: readTheme() });
}
