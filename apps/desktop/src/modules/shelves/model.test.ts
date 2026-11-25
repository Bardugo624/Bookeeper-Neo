import { describe, expect, it } from 'vitest';
import type { ShelfBook } from '@bookeeper/api';
import { applyMoves, isSamePlace, planPlacement, shiftedBy } from './model';

const b = (id: string, slot: number, row = 0): ShelfBook => ({
  book_id: id, title: id, authors: [], row_index: row, slot_index: slot, cover_color: null, progressive_number: null, spine_width: null,
});

describe('planPlacement', () => {
  it('takes the first free slot between the neighbours', () => {
    expect(planPlacement([b('a', 0), b('c', 5)], 'x', 1, 10)).toEqual({ slot: 1, moves: [{ bookId: 'x', slot: 1 }] });
    expect(planPlacement([], 'x', 0, 10)?.slot).toBe(0);
    expect(planPlacement([b('a', 3)], 'x', 0, 10)?.slot).toBe(0);
  });

  it('asks for the slot of the next book and lets the run slide right', () => {
    const plan = planPlacement([b('a', 0), b('b', 1), b('c', 2), b('d', 4)], 'x', 1, 10);
    expect(plan).toEqual({
      slot: 1,
      moves: [{ bookId: 'b', slot: 2 }, { bookId: 'c', slot: 3 }, { bookId: 'x', slot: 1 }],
    });
  });

  it('has no plan for a full row that does not hold the book', () => {
    expect(planPlacement([b('a', 0), b('b', 1)], 'x', 1, 2)).toBeNull();
  });

  it('reorders a full row without leaving it', () => {
    const row = [b('a', 0), b('b', 1), b('c', 2), b('d', 3), b('e', 4)];
    expect(planPlacement(row, 'e', 0, 5)).toEqual({
      slot: 0,
      moves: ['a', 'b', 'c', 'd'].map((id, i) => ({ bookId: id, slot: i + 1 })).concat([{ bookId: 'e', slot: 0 }]),
    });
  });

  it('slides the books left when a book moves right to the end of a full row', () => {
    const row = [b('a', 0), b('b', 1), b('c', 2)];
    expect(planPlacement(row, 'a', 2, 3)).toEqual({
      slot: 2,
      moves: [{ bookId: 'b', slot: 0 }, { bookId: 'c', slot: 1 }, { bookId: 'a', slot: 2 }],
    });
  });
});

describe('planPlacement, moving right inside a row whose run reaches the end', () => {
  const order = (row: ReturnType<typeof b>[], id: string, index: number, slots: number) => {
    const plan = planPlacement(row, id, index, slots)!;
    const out = applyMoves(row, 0, plan.moves);
    return out.sort((x, y) => x.slot_index - y.slot_index).map((x) => x.book_id).join('');
  };
  it('lands before the neighbour in a full row', () => {
    const row = [b('a', 0), b('b', 1), b('c', 2), b('d', 3), b('e', 4)];
    expect(order(row, 'a', 2, 5)).toBe('bcade');
  });
  it('lands before the neighbour with a gap on the left', () => {
    const row = [b('a', 0), b('b', 2), b('c', 3), b('d', 4)];
    expect(order(row, 'a', 1, 5)).toBe('bacd');
  });
});

describe('shiftedBy', () => {
  it('is empty when the run reaches the end of the row and nothing can slide left', () => {
    expect(shiftedBy([b('a', 3), b('b', 4)], 'x', 3, 5)).toEqual([]);
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
