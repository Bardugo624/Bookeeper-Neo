import { describe, expect, it } from 'vitest';
import { spineHeight, spineWidth } from './spine';

describe('spineWidth', () => {
  it('is 12 up to 80 pages and 34 from 900', () => {
    expect(spineWidth(1)).toBe(12);
    expect(spineWidth(80)).toBe(12);
    expect(spineWidth(900)).toBe(34);
    expect(spineWidth(2000)).toBe(34);
  });
  it('is linear in between', () => {
    expect(spineWidth(490)).toBe(23);
  });
  it('is 20 without a usable page count', () => {
    for (const p of [undefined, NaN, 0, -5, -Infinity]) expect(spineWidth(p)).toBe(20);
  });
  it('treats Infinity as 900', () => {
    expect(spineWidth(Infinity)).toBe(34);
  });
});

describe('spineHeight', () => {
  it('stays within 86..100 and is deterministic', () => {
    for (const s of ['', 'a', 'b', 'uuid-1', 'uuid-2', 'x'.repeat(40)]) {
      const h = spineHeight(s);
      expect(h).toBeGreaterThanOrEqual(86);
      expect(h).toBeLessThanOrEqual(100);
      expect(spineHeight(s)).toBe(h);
    }
  });
  it('varies across seeds', () => {
    const set = new Set(Array.from({ length: 30 }, (_, i) => spineHeight(`book-${i}`)));
    expect(set.size).toBeGreaterThan(3);
  });
});
