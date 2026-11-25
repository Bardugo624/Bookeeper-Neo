import { describe, expect, it } from 'vitest';
import { t } from '@bookeeper/i18n';

const sources = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

/** String literals in the first argument of every `t(...)` call (so both branches of a ternary). */
function literalKeys(source: string): string[] {
  const keys: string[] = [];
  const call = /(?<![\w.$])t\(/g;
  let m: RegExpExecArray | null;
  while ((m = call.exec(source))) {
    let depth = 0;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < source.length; i++) {
      const c = source[i]!;
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) break;
        depth--;
      } else if (c === ',' && depth === 0) break;
    }
    for (const lit of source.slice(start, i).matchAll(/'([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)'/g)) keys.push(lit[1]!);
  }
  return keys;
}

describe('translation keys', () => {
  it('finds the keys it should', () => {
    expect(literalKeys(`t(a ? 'x.y' : 'x.z', { n: 1 })`)).toEqual(['x.y', 'x.z']);
  });

  it('every literal key passed to t() exists in Italian', () => {
    const missing: string[] = [];
    for (const [path, source] of Object.entries(sources)) {
      if (/\.test\.tsx?$/.test(path) || path.includes('testkit') || path.includes('testing')) continue;
      for (const key of literalKeys(source)) {
        // Plural entries are looked up with a count; try both.
        if (t('it', key) === key && t('it', key, { count: 1 }) === key) missing.push(`${path}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
