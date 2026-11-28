import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { DEFAULT_LOCALE, t, type Locale } from '@bookeeper/i18n';

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** The language of the reader's texts: `<ReaderLocale locale="it">`. */
export function ReaderLocale({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** `t` bound to the language of the nearest `ReaderLocale`, with whole keys, namespace included. */
export function useReaderT() {
  const locale = useContext(LocaleContext);
  return useCallback((key: string, vars?: Parameters<typeof t>[2]) => t(locale, key, vars), [locale]);
}

export function useReaderLocale(): Locale {
  return useContext(LocaleContext);
}
