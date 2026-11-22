import { expect, it } from 'vitest';
import it_ from './it.json'; import en from './en.json';
import { resolveLocale, t } from './index';

it('interpolates', () => { expect(t('it', 'status.connected', { version: '2.0.0' })).toBe('Collegato · versione 2.0.0'); });
it('returns the key when missing everywhere', () => { expect(t('en', 'nope.nope')).toBe('nope.nope'); });
it('resolves system locale, defaulting to Italian', () => {
  expect(resolveLocale('system', 'en-GB')).toBe('en');
  expect(resolveLocale('system', 'fr-FR')).toBe('it');
  expect(resolveLocale('en', 'it-IT')).toBe('en');
});
it('has the same keys in both languages', () => {
  const keys = (o: object, p = ''): string[] => Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]);
  expect(keys(en).sort()).toEqual(keys(it_).sort());
});
