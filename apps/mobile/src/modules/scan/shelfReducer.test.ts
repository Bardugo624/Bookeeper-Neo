import { describe, expect, it } from 'vitest';
import {
  REPEAT_MS,
  accepts,
  countKind,
  countPlaced,
  initialState,
  reduce,
  type Action,
  type SessionState,
  type Step,
} from './shelfReducer';

const run = (actions: Action[], from: SessionState = initialState) => actions.reduce(reduce, from);
const placed = (n: number): Step => ({ kind: 'placed', isbn: `i${n}`, title: `Libro ${n}`, bookId: `b${n}`, slot: n - 1, from: null });
const moved: Step = { kind: 'moved', isbn: 'i9', title: 'Libro 9', bookId: 'b9', slot: 2, from: { shelfId: 's2', row: 1, slot: 5 } };
const added: Step = { kind: 'added', isbn: 'i8', title: 'Libro 8', bookId: 'b8', slot: 3, from: null };
const read = (code: string, at = 0): Action => ({ type: 'read', code, at });
const step = (s: Step, isbn = s.isbn): Action => ({ type: 'outcome', isbn, outcome: { kind: 'step', step: s } });

describe('outcomes', () => {
  it('a placed book is counted, shown, and can be undone', () => {
    const s = run([read('i1'), step(placed(1))]);
    expect(s.busy).toBe(false);
    expect(s.steps).toEqual([placed(1)]);
    expect(s.feedback).toMatchObject({ kind: 'placed', title: 'Libro 1', slot: 0 });
    expect(s.undo).toEqual(placed(1));
  });

  it('a moved book remembers where it was', () => {
    const s = run([read('i9'), step(moved)]);
    expect(s.feedback).toMatchObject({ kind: 'moved', from: { shelfId: 's2', row: 1, slot: 5 } });
    expect(countKind(s.steps, 'moved')).toBe(1);
  });

  it('an added book is counted as added', () => {
    const s = run([read('i8'), step(added)]);
    expect(s.feedback?.kind).toBe('added');
    expect(countPlaced(s.steps)).toBe(1);
  });

  it('a book already here only gives a reply: no step, nothing to undo', () => {
    const s = run([read('i1'), { type: 'outcome', isbn: 'i1', outcome: { kind: 'here', title: 'Libro 1', slot: 4 } }]);
    expect(s.steps).toEqual([]);
    expect(s.feedback).toEqual({ kind: 'here', title: 'Libro 1', slot: 4 });
    expect(s.undo).toBeNull();
    expect(s.busy).toBe(false);
  });

  it('an unknown book waits for a title; skipping records a skipped step and keeps the undo', () => {
    let s = run([read('i1'), step(placed(1)), read('i2', 10_000), { type: 'outcome', isbn: 'i2', outcome: { kind: 'need-title' } }]);
    expect(s.awaiting).toBe('i2');
    expect(s.busy).toBe(true);
    s = reduce(s, { type: 'skip', isbn: 'i2' });
    expect(s.awaiting).toBeNull();
    expect(s.busy).toBe(false);
    expect(s.steps.map((x) => x.kind)).toEqual(['placed', 'skipped']);
    expect(countPlaced(s.steps)).toBe(1);
    expect(s.undo).toEqual(placed(1));
  });

  it('giving the title closes the wait and keeps busy until the outcome', () => {
    const s = run([read('i2'), { type: 'outcome', isbn: 'i2', outcome: { kind: 'need-title' } }, { type: 'titled' }]);
    expect(s.awaiting).toBeNull();
    expect(s.busy).toBe(true);
  });

  it('a full row stops the session without counting the book', () => {
    const s = run([read('i1'), step(placed(1)), read('i2', 5000), { type: 'outcome', isbn: 'i2', outcome: { kind: 'full' } }]);
    expect(s.status).toBe('full');
    expect(s.steps).toHaveLength(1);
    expect(accepts(s, 'i3', 99_999)).toBe(false);
  });

  it('finish ends a running session only', () => {
    expect(reduce(initialState, { type: 'finish' }).status).toBe('finished');
    const full = { ...initialState, status: 'full' as const };
    expect(reduce(full, { type: 'finish' }).status).toBe('full');
  });
});

describe('the same code twice', () => {
  it('is ignored within three seconds, taken after', () => {
    let s = run([read('i1', 1000), step(placed(1))]);
    expect(reduce(s, read('i1', 1000 + REPEAT_MS - 1))).toBe(s);
    s = reduce(s, read('i1', 1000 + REPEAT_MS));
    expect(s.busy).toBe(true);
  });

  it('does not ignore a different code', () => {
    const s = run([read('i1', 1000), step(placed(1))]);
    expect(reduce(s, read('i2', 1100)).busy).toBe(true);
  });

  it('ignores every code while one is being resolved', () => {
    const s = reduce(initialState, read('i1', 0));
    expect(reduce(s, read('i2', 10))).toBe(s);
  });
});

describe('undo', () => {
  it.each([
    ['placed', placed(1)],
    ['moved', moved],
    ['added', added],
  ])('takes back a %s book once, and only that one', (_name, s0) => {
    let s = run([read(s0.isbn), step(s0)]);
    s = reduce(s, { type: 'undo-start' });
    expect(s.busy).toBe(true);
    s = reduce(s, { type: 'undo-done', at: 1200 });
    expect(s.steps).toEqual([]);
    expect(s.undo).toBeNull();
    expect(s.busy).toBe(false);
    expect(s.feedback).toEqual({ kind: 'undone', title: s0.title });
    expect(reduce(s, { type: 'undo-start' })).toBe(s);
  });

  it('removes only the last placed book, leaving the earlier ones', () => {
    let s = run([read('i1'), step(placed(1)), read('i2', 5000), step(placed(2))]);
    s = run([{ type: 'undo-start' }, { type: 'undo-done', at: 1200 }], s);
    expect(s.steps).toEqual([placed(1)]);
    expect(s.undo).toBeNull();
  });

  it('still ignores the same code read again within three seconds of the undo', () => {
    let s = run([read('i1', 1000), step(placed(1)), { type: 'undo-start' }, { type: 'undo-done', at: 1200 }]);
    expect(reduce(s, read('i1', 1500))).toBe(s);
    s = reduce(s, read('i1', 4300));
    expect(s.busy).toBe(true);
  });

  it('does not finish while a step is in flight', () => {
    const s = reduce(initialState, read('i1'));
    expect(reduce(s, { type: 'finish' })).toBe(s);
  });

  it('keeps the step when the undo fails on the network', () => {
    const s = run([read('i1'), step(placed(1)), { type: 'undo-start' }, { type: 'undo-fail' }]);
    expect(s.steps).toEqual([placed(1)]);
    expect(s.undo).toEqual(placed(1));
    expect(s.busy).toBe(false);
    expect(s.feedback?.kind).toBe('undoError');
  });
});

describe('network failure and retry', () => {
  it('counts nothing, offers retry for that code, and the session goes on', () => {
    let s = run([read('i1', 0), { type: 'fail', isbn: 'i1' }]);
    expect(s.steps).toEqual([]);
    expect(s.failed).toBe('i1');
    expect(s.feedback?.kind).toBe('error');
    expect(s.busy).toBe(false);
    expect(s.status).toBe('running');
    s = reduce(s, { type: 'retry' });
    expect(s.busy).toBe(true);
    expect(s.failed).toBeNull();
    s = reduce(s, step(placed(1)));
    expect(countPlaced(s.steps)).toBe(1);
  });

  it('ignores a retry when nothing failed', () => {
    expect(reduce(initialState, { type: 'retry' })).toBe(initialState);
  });
});
