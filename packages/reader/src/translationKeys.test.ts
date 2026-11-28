// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { LOCALES, t, type Locale } from '@bookeeper/i18n';

const srcDir = fileURLToPath(new URL('.', import.meta.url));
const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter(
  (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
);
const keys = new Set(
  files.flatMap((f) =>
    [...readFileSync(join(srcDir, f), 'utf8').matchAll(/['"`]((?:reader|rpanel|rlook)\.[\w.]+)['"`]/g)].map((m) => m[1]!),
  ),
);

// `t()` returns the key itself for a missing message, so nothing else notices a forgotten key.
// A base `percentPhrase` reads counts when its three article forms are there.
const has = (locale: Locale, key: string) => t(locale, key) !== key;
it.each(LOCALES.flatMap((l) => [...keys].map((k) => [l, k] as const)))('%s has %s', (locale, key) => {
  expect(has(locale, key) || ['_al', '_all', '_allo'].every((form) => has(locale, key + form))).toBe(true);
});

it('reads the source tree', () => {
  expect(files.length).toBeGreaterThan(0);
});
