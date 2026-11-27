import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { resolveLocale, t, type Locale } from '@bookeeper/i18n';

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

const LocaleContext = createContext<Locale>('it');

function systemLanguage(): string {
  return typeof navigator === 'undefined' ? 'it' : navigator.language;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('languagechange', onChange);
  return () => window.removeEventListener('languagechange', onChange);
}

/** The language follows Windows (Italian or English). An explicit `locale` wins: tests and previews. */
export function LocaleProvider({ locale, children }: { locale?: Locale; children: ReactNode }) {
  const system = useSyncExternalStore(subscribe, systemLanguage, () => 'it');
  const value = locale ?? resolveLocale('system', system);
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
