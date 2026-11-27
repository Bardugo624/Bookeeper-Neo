// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { findLiteralColor } from '../styleCheck';

const dir = new URL('./', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.module.css'));
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function withoutMotionBlocks(css: string): string {
  const marker = '@media (prefers-reduced-motion: no-preference)';
  let out = css;
  for (let start = out.indexOf(marker); start !== -1; start = out.indexOf(marker)) {
    const open = out.indexOf('{', start);
    let depth = 0;
    let end = open;
    for (; end < out.length; end++) {
      if (out[end] === '{') depth++;
      else if (out[end] === '}' && --depth === 0) break;
    }
    out = out.slice(0, start) + out.slice(end + 1);
  }
  return out;
}

it('finds the module stylesheets', () => {
  expect(files.length).toBeGreaterThanOrEqual(5);
});

it.each(files)('%s has no literal colors', (file) => {
  const css = strip(readFileSync(new URL(file, dir), 'utf8'));
  expect(findLiteralColor(css)).toBeNull();
});

it.each(files)('%s animates only under prefers-reduced-motion: no-preference', (file) => {
  const css = withoutMotionBlocks(strip(readFileSync(new URL(file, dir), 'utf8')));
  expect(css).not.toMatch(/\b(transition|animation)(-[a-z]+)*\s*:/);
});

it('gives the 3D book a 2:3 cover face sized by --book-face, beside the spine', () => {
  const css = readFileSync(new URL('./Book3D.module.css', import.meta.url), 'utf8');
  const rule = (sel: string) => new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  expect(rule('.cover')).toMatch(/aspect-ratio:\s*2\s*\/\s*3/);
  expect(rule('.cover')).toMatch(/width:\s*var\(--book-face\)/);
  expect(rule('.book')).not.toMatch(/aspect-ratio/);
});
