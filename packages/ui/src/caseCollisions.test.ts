import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function stem(file: string): string {
  const base = path.posix.basename(file);
  const dot = base.indexOf('.', 1);
  return dot === -1 ? base : base.slice(0, dot);
}

describe('case-insensitive file names', () => {
  it('has no two tracked files whose names differ only by letter case', () => {
    const files = execFileSync('git', ['ls-files', '-z', '--', 'packages', 'apps'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\0')
      .filter(Boolean);

    // key: folder + lowercase name without extension -> set of exact stems
    const groups = new Map<string, Map<string, string[]>>();
    for (const file of files) {
      const dir = path.posix.dirname(file);
      const s = stem(file);
      const key = `${dir}/${s.toLowerCase()}`;
      const exact = groups.get(key) ?? new Map<string, string[]>();
      exact.set(s, [...(exact.get(s) ?? []), file]);
      groups.set(key, exact);
    }

    const collisions: string[] = [];
    for (const exact of groups.values()) {
      if (exact.size < 2) continue;
      const all = [...exact.values()].flat().sort();
      collisions.push(all.join('  <->  '));
    }
    expect(collisions, `Names that collide on case-insensitive file systems:\n${collisions.join('\n')}`).toEqual([]);
  });
});
