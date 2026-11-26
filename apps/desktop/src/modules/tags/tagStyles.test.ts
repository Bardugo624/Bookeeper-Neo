// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./TagChips.module.css', import.meta.url)), 'utf8');

describe('tag chip styles', () => {
  it('writes the text color with a token and uses the tag color only for fills and borders', () => {
    expect(css).toMatch(/\.chip\s*\{[^}]*\n\s*color:\s*var\(--bk-text\);/);
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const uses = [...bare.matchAll(/([\w-]+)\s*:([^;{}]*)/g)].filter((m) => m[2]!.includes('var(--tag-color)')).map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const property of uses) expect(['background', 'border']).toContain(property);
  });
});
