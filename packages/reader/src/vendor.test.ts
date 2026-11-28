// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const vendor = fileURLToPath(new URL('../vendor/', import.meta.url));
const copy = join(vendor, 'foliate-js');
const md = readFileSync(join(vendor, 'VENDOR.md'), 'utf8');

const listed = new Map(
  [...md.matchAll(/^\| `([^`]+)` \| ([0-9a-f]{64}) \|$/gm)].map((m) => [m[1]!, m[2]!] as const),
);
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const onDisk = walk(copy).map((f) => relative(copy, f).split(sep).join('/'));

describe('the foliate-js copy', () => {
  it('names the commit it was taken from', () => {
    expect(md).toContain('78914aef4466eb960965702401634c2cb348e9b1');
  });
  it('lists every file it holds, and only those', () => {
    expect(onDisk.sort()).toEqual([...listed.keys()].sort());
  });
  it.each([...listed])('%s is identical to the commit', (file, sha) => {
    expect(createHash('sha256').update(readFileSync(join(copy, file))).digest('hex')).toBe(sha);
  });
  it('keeps the licenses', () => {
    for (const name of ['foliate-js', 'pdfjs', 'zip.js', 'fflate']) {
      expect(readFileSync(join(vendor, 'licenses', `${name}-LICENSE`), 'utf8').length).toBeGreaterThan(500);
    }
  });
});
