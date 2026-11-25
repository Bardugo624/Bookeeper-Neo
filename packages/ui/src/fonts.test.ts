// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

const css = readFileSync(new URL('./fonts.css', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);

function resolves(spec: string): boolean {
  try {
    return existsSync(require.resolve(spec));
  } catch {
    return false;
  }
}

const targets = [
  ...[...css.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)].map((m) => m[1]!),
  ...[...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map((m) => m[1]!),
];

it('imports or references at least the Inter and Lora files', () => {
  expect(targets.some((t) => t.includes('inter'))).toBe(true);
  expect(targets.some((t) => t.includes('lora'))).toBe(true);
});
it.each(targets)('%s exists in node_modules', (t) => {
  expect(resolves(t)).toBe(true);
});
it('declares the family names used by the token stacks, latin subsets only', () => {
  expect(css).toContain("'Inter Variable'");
  expect(css).toContain("'Lora Variable'");
  expect(css).toMatch(/font-style:\s*italic/);
  expect(css).not.toMatch(/cyrillic|greek|vietnamese/);
});
