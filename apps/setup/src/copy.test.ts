import { describe, expect, it } from 'vitest';
import it_ from '../../../packages/i18n/src/locales/it/setup.json';
import en from '../../../packages/i18n/src/locales/en/setup.json';

type Tree = { [key: string]: string | Tree };

function strings(tree: Tree, path = ''): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [[`${path}${k}`, v] as [string, string]] : strings(v, `${path}${k}.`)));
}

describe('Setup copy', () => {
  it.each([
    ['it', it_],
    ['en', en],
  ])('uses typographic apostrophes in %s', (_lang, tree) => {
    expect(strings(tree as Tree).filter(([, v]) => v.includes("'"))).toEqual([]);
  });
});
