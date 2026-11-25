import type { Stats } from '@bookeeper/api';
import { describe, expect, it } from 'vitest';
import { DISTRIBUTIONS, TOTALS, toRows } from './model';
import { OVERVIEW, stats } from './testkit';

const opts = { missing: 'Non indicato', others: 'Altri', decadeLabel: (d: string) => `Anni ${d}` };

describe('toRows', () => {
  it('sorts by count, descending, with the empty and others buckets last', () => {
    const rows = toRows(
      [
        { key: '', count: 50 },
        { key: 'a', count: 1 },
        { key: '…', count: 9 },
        { key: 'b', count: 4 },
      ],
      opts,
    );
    expect(rows.map((r) => [r.label, r.count])).toEqual([
      ['b', 4],
      ['a', 1],
      ['Altri', 9],
      ['Non indicato', 50],
    ]);
  });

  it('keeps the core order for chronological lists and labels decades', () => {
    const rows = toRows([{ key: '1990', count: 1 }, { key: '2000', count: 5 }], { ...opts, chronological: true, decade: true });
    expect(rows.map((r) => r.label)).toEqual(['Anni 1990', 'Anni 2000']);
  });
});

describe('fields come from the Stats type', () => {
  it('has a total for every overview field and only those', () => {
    expect(Object.keys(TOTALS).sort()).toEqual(Object.keys(OVERVIEW).sort());
  });

  it('only reads distributions that exist on Stats', () => {
    const sample = stats();
    for (const d of DISTRIBUTIONS) {
      const key: keyof Stats = d.key; // type check: a made-up key fails to compile
      expect(Array.isArray(sample[key])).toBe(true);
    }
  });
});
