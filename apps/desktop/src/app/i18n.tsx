import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { resolveLocale, t, type Locale } from '@bookeeper/i18n';

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

const LocaleContext = createContext<Locale>('it');

export function LocaleProvider({ locale, children }: { locale?: Locale; children: ReactNode }) {
  const value = locale ?? resolveLocale('system', typeof navigator === 'undefined' ? 'it' : navigator.language);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): Translate {
  const locale = useContext(LocaleContext);
  return useCallback<Translate>((key, vars) => t(locale, key, vars), [locale]);
}
