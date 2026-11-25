/// <reference path="./glob.d.ts" />
export type Locale = 'it' | 'en';
export const DEFAULT_LOCALE: Locale = 'it';
export const LOCALES: readonly Locale[] = ['it', 'en'];

type Messages = { [key: string]: string | Messages };

const modules = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<
  string,
  { default: Messages }
>;

// Files are locales/<locale>/<namespace>.json; the namespace is the first key segment.
const catalogs: Record<Locale, Messages> = { it: {}, en: {} };
for (const [path, mod] of Object.entries(modules)) {
  const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!match) continue;
  const locale = match[1] as Locale;
  if (!LOCALES.includes(locale)) continue;
  catalogs[locale][match[2]!] = mod.default;
}

export function resolveLocale(pref: Locale | 'system', systemLang: string): Locale {
  if (pref !== 'system') return pref;
  return systemLang.toLowerCase().startsWith('en') ? 'en' : DEFAULT_LOCALE;
}

type Vars = Record<string, string | number>;

function lookup(catalog: Messages, key: string, vars?: Vars, locale?: Locale): string | undefined {
  let node: string | Messages | undefined = catalog;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  if (typeof node === 'string') return node;
  if (
    typeof node === 'object' &&
    node !== null &&
    typeof node.one === 'string' &&
    typeof node.other === 'string' &&
    typeof vars?.count === 'number'
  ) {
    const category = new Intl.PluralRules(locale).select(vars.count);
    return category === 'one' ? node.one : node.other;
  }
  return undefined;
}

export function t(locale: Locale, key: string, vars?: Vars): string {
  const template =
    lookup(catalogs[locale], key, vars, locale) ??
    lookup(catalogs[DEFAULT_LOCALE], key, vars, DEFAULT_LOCALE) ??
    key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Test hook: injects a namespace into one catalog. Not part of the public API. */
export function __setForTest(locale: Locale, namespace: string, messages: Messages): void {
  catalogs[locale][namespace] = messages;
}
