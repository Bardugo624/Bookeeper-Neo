import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { create } from 'zustand';
import { resolveLocale, t, type Locale } from '@bookeeper/i18n';

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export type LocalePreference = 'system' | Locale;

export const LOCALE_KEY = 'bookeeper.locale';

function readPreference(): LocalePreference {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    if (v === 'system' || v === 'it' || v === 'en') return v;
  } catch {
    // Storage unavailable: fall through to the default.
  }
  return 'system';
}

interface PreferenceState {
  preference: LocalePreference;
  setPreference(preference: LocalePreference): void;
}

const usePreferenceStore = create<PreferenceState>((set) => ({
  preference: readPreference(),
  setPreference(preference) {
    try {
      localStorage.setItem(LOCALE_KEY, preference);
    } catch {
      // The choice still applies for this run.
    }
    set({ preference });
  },
}));

/** The stored language choice (`system` follows the browser language) and its setter. */
export function useLocalePreference(): PreferenceState {
  return usePreferenceStore();
}

/** Test hook: re-reads the stored choice. */
export function resetLocalePreferenceForTest(): void {
  usePreferenceStore.setState({ preference: readPreference() });
}

const LocaleContext = createContext<Locale>('it');

function systemLanguage(): string {
  return typeof navigator === 'undefined' ? 'it' : navigator.language;
}

function subscribeSystemLanguage(onChange: () => void): () => void {
  window.addEventListener('languagechange', onChange);
  return () => window.removeEventListener('languagechange', onChange);
}

/** An explicit `locale` (tests, previews) wins over the stored preference. */
export function LocaleProvider({ locale, children }: { locale?: Locale; children: ReactNode }) {
  const preference = usePreferenceStore((s) => s.preference);
  const system = useSyncExternalStore(subscribeSystemLanguage, systemLanguage, () => 'it');
  const value = locale ?? resolveLocale(preference, system);
  useEffect(() => {
    document.documentElement.lang = value;
  }, [value]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): Translate {
  const locale = useContext(LocaleContext);
  return useCallback<Translate>((key, vars) => t(locale, key, vars), [locale]);
}
