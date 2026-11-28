import { describe, expect, it } from 'vitest';
import { SectionMap } from './sections';

describe('SectionMap', () => {
  const map = new SectionMap([100, 0, 300, 100]);
  it('gives the start of each section and the end of the book', () => {
    expect(map.fractions).toEqual([0, 0.2, 0.2, 0.8, 1]);
  });
  it('places a point of a section in the book', () => {
    expect(map.fractionOf(2, 0.5)).toBeCloseTo(0.5);
    expect(map.fractionOf(0, 0)).toBe(0);
  });
  it('finds the section of a place, skipping those that are not read', () => {
    expect(map.locate(0.2)).toEqual({ index: 2, anchor: 0 });
    const hit = map.locate(0.5);
    expect(hit.index).toBe(2);
    expect(hit.anchor).toBeCloseTo(0.5);
    expect(map.locate(1)).toEqual({ index: 3, anchor: 1 });
    expect(map.locate(-1)).toEqual({ index: 0, anchor: 0 });
  });
  it('survives a book without sizes', () => {
    const empty = new SectionMap([0, 0]);
    expect(empty.fractionOf(1, 0.5)).toBe(0);
    expect(empty.locate(0.5).index).toBe(0);
  });
});
