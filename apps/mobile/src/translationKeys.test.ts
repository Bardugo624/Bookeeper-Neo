// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { LOCALES, t } from '@bookeeper/i18n';

const srcDir = fileURLToPath(new URL('.', import.meta.url));
const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter(
  (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
);
const keys = new Set(
  files.flatMap((f) => [...readFileSync(join(srcDir, f), 'utf8').matchAll(/['"`]((?:mobile|common)\.[\w.]+)['"`]/g)].map((m) => m[1]!)),
);

// `t()` returns the key itself for a missing message, so nothing else notices a forgotten key.
it.each(LOCALES.flatMap((l) => [...keys].map((k) => [l, k] as const)))('%s has %s', (locale, key) => {
  expect(t(locale, key)).not.toBe(key);
});
