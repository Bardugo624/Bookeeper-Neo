import { describe, expect, it } from 'vitest';
import type { ShelfBook } from '@bookeeper/api';
import { applyMoves, isSamePlace, planPlacement } from './model';

const b = (id: string, slot: number, row = 0): ShelfBook => ({
  book_id: id, title: id, authors: [], row_index: row, slot_index: slot, cover_color: null, progressive_number: null, spine_width: null,
});

describe('planPlacement', () => {
  it('takes the first free slot between the neighbours', () => {
    expect(planPlacement([b('a', 0), b('c', 5)], 'x', 1, 10)).toEqual({ shifts: [], slot: 1 });
    expect(planPlacement([], 'x', 0, 10)).toEqual({ shifts: [], slot: 0 });
    expect(planPlacement([b('a', 3)], 'x', 0, 10)).toEqual({ shifts: [], slot: 0 });
  });

  it('shifts the following books into the nearest gap, last first', () => {
    const plan = planPlacement([b('a', 0), b('b', 1), b('c', 2), b('d', 4)], 'x', 1, 10);
    expect(plan).toEqual({ slot: 1, shifts: [{ bookId: 'c', slot: 3 }, { bookId: 'b', slot: 2 }] });
  });

  it('shifts the preceding books left when the row is full on the right', () => {
    const row = [b('a', 0), b('b', 2), b('c', 3), b('d', 4)];
    expect(planPlacement(row, 'x', 3, 5)).toEqual({ slot: 3, shifts: [{ bookId: 'b', slot: 1 }, { bookId: 'c', slot: 2 }] });
  });

  it('is null for a full row', () => {
    expect(planPlacement([b('a', 0), b('b', 1)], 'x', 1, 2)).toBeNull();
  });

  it('counts the moved book as an obstacle on its own row', () => {
    // Moving `a` after `b`: a sits at 0, b at 1.
    const plan = planPlacement([b('a', 0), b('b', 1)], 'a', 1, 5);
    expect(plan).toEqual({ shifts: [], slot: 2 });
  });
});

describe('full row reorder', () => {
  it('parks the moved book and shifts the others into its slot', () => {
    const row = [b('a', 0), b('b', 1), b('c', 2), b('d', 3), b('e', 4)];
    const plan = planPlacement(row, 'e', 0, 5)!;
    expect(plan.park).toBe(true);
    expect(plan.slot).toBe(0);
    expect(plan.shifts.map((m) => [m.bookId, m.slot])).toEqual([['d', 4], ['c', 3], ['b', 2], ['a', 1]]);
  });
});

describe('helpers', () => {
  it('recognises a drop onto the same place', () => {
    expect(isSamePlace([b('a', 0), b('b', 1)], 'b', 1)).toBe(true);
    expect(isSamePlace([b('a', 0), b('b', 1)], 'b', 0)).toBe(false);
    expect(isSamePlace([b('a', 0)], 'z', 0)).toBe(false);
  });

  it('applies moves to the listed books only', () => {
    const out = applyMoves([b('a', 0), b('b', 1)], 2, [{ bookId: 'b', slot: 4 }]);
    expect(out.map((x) => [x.row_index, x.slot_index])).toEqual([[0, 0], [2, 4]]);
  });
});
