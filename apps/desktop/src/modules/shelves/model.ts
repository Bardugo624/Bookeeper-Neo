import type { BookOut, ShelfBook, ShelfOut } from '@bookeeper/api';
import { SHELF_COLORS, type ShelfRow, type SpineBook } from '@bookeeper/ui/shelf';

/** Drag payload type shared with `@bookeeper/ui/shelf` (the package does not export the constant). */
export const BOOK_MIME = 'application/x-bookeeper-book';

/** Color names accepted by the core, in the order of `SHELF_COLORS`. */
export const COLOR_NAMES = ['sage', 'terracotta', 'night', 'plum', 'amber', 'graphite'] as const;
export type ColorName = (typeof COLOR_NAMES)[number];

/** Limits enforced by the core (`check_name`, `check_rows`, `check_slots`). */
export const LIMITS = { name: 80, minRows: 1, maxRows: 12, minSlots: 5, maxSlots: 60 } as const;

export function colorOf(name: string): string {
  const i = COLOR_NAMES.indexOf(name as ColorName);
  return SHELF_COLORS[i < 0 ? 0 : i]!;
}

// The core stores a spine width of 1..3; the spine component draws from a page count.
const WIDTH_PAGES: Record<number, number> = { 1: 150, 2: 400, 3: 700 };

export function spineOf(b: ShelfBook): SpineBook {
  return {
    id: b.book_id,
    title: b.title,
    author: b.authors.join(', ') || undefined,
    pages: b.spine_width ? WIDTH_PAGES[b.spine_width] : undefined,
    color: b.cover_color ?? undefined,
  };
}

/** The shelf's books split by row, in slot order. */
export function rowsOf(shelf: ShelfOut, books: ShelfBook[], label: (n: number) => string): ShelfRow[] {
  return Array.from({ length: shelf.rows }, (_, i) => ({
    id: String(i),
    label: label(i + 1),
    capacity: shelf.slots_per_row,
    books: inRow(books, i).map(spineOf),
  }));
}

export function inRow(books: ShelfBook[], rowIndex: number): ShelfBook[] {
  return books.filter((b) => b.row_index === rowIndex).sort((a, b) => a.slot_index - b.slot_index);
}

export interface Move {
  bookId: string;
  slot: number;
}

export interface Plan {
  /** Neighbours that make room, in the order the requests must run. */
  shifts: Move[];
  slot: number;
  /** The moved book has to step aside first: its row is full and its own slot is the only gap. */
  park?: boolean;
}

/**
 * Where a book dropped at `index` (among the row's other books) lands. The core keeps fixed slots, so
 * the book takes a free slot between its neighbours, or the neighbours shift by one towards the nearest
 * gap. `row` holds every book of the row, including the moved one when it comes from the same row:
 * it still sits on its slot until its own request runs. Null when the row has no free slot.
 */
export function planPlacement(row: ShelfBook[], movedId: string, index: number, slots: number): Plan | null {
  const rest = row.filter((b) => b.book_id !== movedId);
  const at = rest[index];
  const pos = at ? row.indexOf(at) : row.length;
  const prev = row[pos - 1];
  const next = row[pos];
  const lo = prev ? prev.slot_index + 1 : 0;
  const hi = next ? next.slot_index - 1 : slots - 1;
  if (lo <= hi) return { shifts: [], slot: lo };

  for (let j = pos; j < row.length; j++) {
    const after = row[j + 1];
    const room = after ? after.slot_index - row[j]!.slot_index > 1 : row[j]!.slot_index < slots - 1;
    if (!room) continue;
    const shifts = row.slice(pos, j + 1).reverse().map((b) => ({ bookId: b.book_id, slot: b.slot_index + 1 }));
    return { shifts, slot: row[pos]!.slot_index };
  }
  for (let j = pos - 1; j >= 0; j--) {
    const before = row[j - 1];
    const room = before ? row[j]!.slot_index - before.slot_index > 1 : row[j]!.slot_index > 0;
    if (!room) continue;
    const shifts = row.slice(j, pos).map((b) => ({ bookId: b.book_id, slot: b.slot_index - 1 }));
    return { shifts, slot: row[pos - 1]!.slot_index };
  }
  // A full row being reordered: the moved book's own slot is the gap, once it has stepped aside.
  if (rest.length !== row.length) {
    const plan = planPlacement(rest, movedId, index, slots);
    return plan && { ...plan, park: true };
  }
  return null;
}

/** A slot of the shelf, outside `rowIndex`, where nobody sits; null when there is none. */
export function freeSlotElsewhere(books: ShelfBook[], rows: number, slots: number, rowIndex: number): Move & { row: number } | null {
  const taken = new Set(books.map((b) => `${b.row_index}:${b.slot_index}`));
  for (let r = 0; r < rows; r++) {
    if (r === rowIndex) continue;
    for (let s = 0; s < slots; s++) if (!taken.has(`${r}:${s}`)) return { bookId: '', slot: s, row: r };
  }
  return null;
}

/** True when dropping `bookId` at `index` of its own row would change nothing. */
export function isSamePlace(row: ShelfBook[], bookId: string, index: number): boolean {
  return row.findIndex((b) => b.book_id === bookId) === index;
}

/** The list after some books changed slot (row and slot of each moved book). */
export function applyMoves(books: ShelfBook[], rowIndex: number, moves: Move[]): ShelfBook[] {
  const slotOf = new Map(moves.map((m) => [m.bookId, m.slot]));
  return books.map((b) => (slotOf.has(b.book_id) ? { ...b, row_index: rowIndex, slot_index: slotOf.get(b.book_id)! } : b));
}

/** A book from the library list, as the shelf lists it once placed. */
export function asShelfBook(book: BookOut, rowIndex: number, slot: number): ShelfBook {
  return {
    book_id: book.id,
    title: book.title,
    authors: book.authors,
    progressive_number: book.progressive_number ?? null,
    cover_color: book.cover_color ?? null,
    row_index: rowIndex,
    slot_index: slot,
    spine_width: null,
  };
}

/** Free places, as a count; null when the core gave no capacity. */
export function freeSlots(shelf: ShelfOut): number | null {
  return shelf.capacity > 0 ? Math.max(0, shelf.capacity - shelf.book_count) : null;
}
