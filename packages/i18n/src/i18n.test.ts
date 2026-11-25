import { describe, expect, it } from 'vitest';
import { LOCALES, resolveLocale, t } from './index';

type Messages = { [key: string]: string | Messages };
const files = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<
  string,
  { default: Messages }
>;

function namespaces(locale: string): Record<string, Messages> {
  const out: Record<string, Messages> = {};
  for (const [path, mod] of Object.entries(files)) {
    const m = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
    if (m && m[1] === locale) out[m[2]!] = mod.default;
  }
  return out;
}
const leaves = (o: Messages, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' ? leaves(v, `${p}${k}.`) : [`${p}${k}`],
  );

describe('existing keys', () => {
  it('render the same text as before, in both languages', () => {
    expect(t('it', 'app.name')).toBe('Bookeeper');
    expect(t('en', 'app.name')).toBe('Bookeeper');
    expect(t('it', 'status.connected', { version: '2.0.0' })).toBe('Collegato · versione 2.0.0');
    expect(t('en', 'status.connected', { version: '2.0.0' })).toBe('Connected · version 2.0.0');
    expect(t('it', 'status.unreachable')).toBe('Libreria non raggiungibile');
    expect(t('en', 'status.unreachable')).toBe('Library unreachable');
    expect(t('it', 'mobile.needsHttps')).toBe(
      'Per usare Bookeeper dal telefono serve un indirizzo sicuro. Chiedi a chi gestisce la libreria.',
    );
    expect(t('en', 'mobile.needsHttps')).toBe(
      'To use Bookeeper on your phone you need a secure address. Ask whoever runs the library.',
    );
  });
});

it('returns the key when missing everywhere', () => {
  expect(t('en', 'nope.nope')).toBe('nope.nope');
});
it('resolves system locale, defaulting to Italian', () => {
  expect(resolveLocale('system', 'en-GB')).toBe('en');
  expect(resolveLocale('system', 'fr-FR')).toBe('it');
  expect(resolveLocale('en', 'it-IT')).toBe('en');
});

it('every key exists in every locale', () => {
  const all = new Set(Object.keys(namespaces('it')).concat(Object.keys(namespaces('en'))));
  const missing: string[] = [];
  for (const ns of all) {
    const sets = LOCALES.map((l) => ({ l, keys: new Set(leaves(namespaces(l)[ns] ?? {}, `${ns}.`)) }));
    const union = new Set(sets.flatMap((s) => [...s.keys]));
    for (const { l, keys } of sets)
      for (const k of union) if (!keys.has(k)) missing.push(`${l}: ${k}`);
  }
  expect(missing).toEqual([]);
});

it('no namespace file is empty', () => {
  const empty = Object.entries(files)
    .filter(([, mod]) => leaves(mod.default).length === 0)
    .map(([p]) => p);
  expect(empty).toEqual([]);
  expect(Object.keys(files).length).toBeGreaterThan(0);
});

it('falls back from en to it, then to the key', () => {
  // Italian-only key is simulated through a locale lacking it: unknown in both returns the key.
  expect(t('en', 'status.unreachable')).toBe('Library unreachable');
  expect(t('en', 'missing.key')).toBe('missing.key');
});

describe('plurals and variables', () => {
  // Plural objects are exercised through a catalog entry injected for the test.
  it('picks one/other with Intl.PluralRules', async () => {
    const { __setForTest } = await import('./index');
    __setForTest('it', 'test', { books: { one: '{count} libro', other: '{count} libri' } });
    expect(t('it', 'test.books', { count: 1 })).toBe('1 libro');
    expect(t('it', 'test.books', { count: 5 })).toBe('5 libri');
  });
  it('falls back to it when en lacks the key', async () => {
    const { __setForTest } = await import('./index');
    __setForTest('it', 'only', { x: 'solo italiano' });
    expect(t('en', 'only.x')).toBe('solo italiano');
  });
  it('keeps the placeholder when the variable is absent', () => {
    expect(t('it', 'status.connected', {})).toBe('Collegato · versione {version}');
  });
});
