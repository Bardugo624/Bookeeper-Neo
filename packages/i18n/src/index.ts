import it from './it.json';
import en from './en.json';

export type Locale = 'it' | 'en';
export const DEFAULT_LOCALE: Locale = 'it';

type Messages = { [key: string]: string | Messages };
const catalogs: Record<Locale, Messages> = { it, en };

export function resolveLocale(pref: Locale | 'system', systemLang: string): Locale {
  if (pref !== 'system') return pref;
  return systemLang.toLowerCase().startsWith('en') ? 'en' : DEFAULT_LOCALE;
}

function lookup(catalog: Messages, key: string): string | undefined {
  let node: string | Messages | undefined = catalog;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const template = lookup(catalogs[locale], key) ?? lookup(catalogs[DEFAULT_LOCALE], key) ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
