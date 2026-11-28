// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { LOCALES, t } from '@bookeeper/i18n';

const dir = fileURLToPath(new URL('.', import.meta.url));
const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$|testkit/.test(f));
const keys = new Set(files.flatMap((f) => [...readFileSync(join(dir, f), 'utf8').matchAll(/['"`](mreader\.[\w.]+)['"`]/g)].map((m) => m[1]!)));

it('uses_some_keys', () => expect(keys.size).toBeGreaterThan(0));
it.each(LOCALES.flatMap((l) => [...keys].map((k) => [l, k] as const)))('%s has %s', (locale, key) => {
  expect(t(locale, key)).not.toBe(key);
});
