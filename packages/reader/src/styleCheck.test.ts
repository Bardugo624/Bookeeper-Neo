import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';

const srcDir = join(process.cwd(), 'src');
const ALLOWED = new Set(['model/themeColors.ts', 'model/highlightColors.ts']);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(ts|tsx|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

function literalColor(source: string): string | null {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/url\([^)]*\)/gi, '');
  const m =
    /(?<![\w&])#[0-9a-f]{3,8}\b/i.exec(code) ?? /\b(?:rgba?|hsla?|hwb|oklab|oklch)\(/i.exec(code);
  return m ? m[0] : null;
}

it('literal_colors_only_in_the_two_data_files', () => {
  const offenders = files(srcDir)
    .map((f) => relative(srcDir, f).split('\\').join('/'))
    .filter((f) => !ALLOWED.has(f))
    .filter((f) => literalColor(readFileSync(join(srcDir, f), 'utf8')) !== null);
  expect(offenders).toEqual([]);
});
