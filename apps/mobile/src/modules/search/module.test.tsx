// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES, t } from '@bookeeper/i18n';

const dir = fileURLToPath(new URL('.', import.meta.url));
const read = (f: string) => readFileSync(join(dir, f), 'utf8');
const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const keys = new Set(sources.flatMap((f) => [...read(f).matchAll(/['"`](msearch\.[\w.]+)['"`]/g)].map((m) => m[1]!)));
// Keys built from a filter id.
for (const id of ['all', 'loan', 'unshelved']) keys.add(`msearch.filters.${id}`);
for (const id of ['to_read', 'reading', 'read', 'abandoned', 'none']) keys.add(`msearch.reading.${id}`);

describe('translations', () => {
  it.each(LOCALES.flatMap((l) => [...keys].map((k) => [l, k] as const)))('%s has %s', (locale, key) => {
    expect(t(locale, key, { count: 2 })).not.toBe(key);
  });
});

describe('stylesheets', () => {
  const rule = (file: string, name: string) =>
    new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`).exec(read(file))?.[1] ?? '';
  const px = (css: string, prop: string) => Number(new RegExp(`${prop}:\\s*(\\d+)px`).exec(css)?.[1]);

  it('makes result rows at least 44px tall', () => {
    expect(px(rule('BookRow.module.css', 'row'), 'min-height')).toBeGreaterThanOrEqual(44);
  });

  it('keeps every result row as tall: the title always holds two lines, the author one', () => {
    const title = rule('BookRow.module.css', 'title');
    // room for two lines in em, which grow with the text, whether the title takes one or two
    const lineHeight = Number(/line-height:\s*([\d.]+)\s*;/.exec(title)?.[1]);
    const minHeight = Number(/min-height:\s*([\d.]+)em\s*;/.exec(title)?.[1]);
    expect(minHeight).toBeCloseTo(2 * lineHeight);
    expect(title).toMatch(/-webkit-line-clamp:\s*2;/);
    expect(rule('BookRow.module.css', 'author')).toMatch(/white-space:\s*nowrap;/);
    // a row without an author keeps the author's line
    expect(read('BookRow.tsx')).toMatch(/className=\{styles\.author\}[^>]*>\s*\{author \|\| '\\u00a0'\}/);
  });

  it('makes the tap targets at least 44px', () => {
    const field = read('SearchField.module.css');
    expect(px(rule('SearchField.module.css', 'clear'), 'width')).toBeGreaterThanOrEqual(44);
    expect(px(rule('SearchField.module.css', 'clear'), 'height')).toBeGreaterThanOrEqual(44);
    expect(px(/\.field \.input\s*\{([^}]*)\}/.exec(field)?.[1] ?? '', 'min-height')).toBeGreaterThanOrEqual(44);
    expect(px(rule('Description.module.css', 'toggle'), 'min-height')).toBeGreaterThanOrEqual(44);
    expect(px(rule('BookDetailPage.module.css', 'back'), 'height')).toBeGreaterThanOrEqual(44);
    expect(px(/\.chip\s*\{([^}]*)\}/.exec(read('FilterBar.module.css'))?.[1] ?? '', 'min-height')).toBeGreaterThanOrEqual(44);
    expect(px(rule('SearchPage.module.css', 'open'), 'min-height')).toBeGreaterThanOrEqual(44);
    expect(px(rule('ActiveFilters.module.css', 'remove'), 'width')).toBeGreaterThanOrEqual(44);
  });

  it('keeps the search text at 16px so the phone does not zoom', () => {
    expect(px(/\.field \.input\s*\{([^}]*)\}/.exec(read('SearchField.module.css'))?.[1] ?? '', 'font-size')).toBeGreaterThanOrEqual(16);
  });
});
