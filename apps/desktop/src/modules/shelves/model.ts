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
  /** The slot the moved book is sent to. */
  slot: number;
  /** Books that slide with it, as the core will move them; empty when the core answers `row_full`. */
  moves: Move[];
}

/**
 * Where a book dropped at `index` (among the row's other books) is sent. It takes a free slot between
 * its neighbours; with none, it asks for the slot of the book it goes before and the core slides the
 * run of books from there one slot right (`shift: true`). `row` holds every book of the row, including
 * the moved one when it comes from the same row. Null when the row has no free slot for a newcomer.
 */
export function planPlacement(row: ShelfBook[], movedId: string, index: number, slots: number): Plan | null {
  const rest = row.filter((b) => b.book_id !== movedId);
  if (rest.length >= slots) return null;
  const at = rest[index];
  const prev = rest[(at ? index : rest.length) - 1];
  const lo = prev ? prev.slot_index + 1 : 0;
  const hi = at ? at.slot_index - 1 : slots - 1;
  const slot = lo <= hi ? lo : at ? at.slot_index : prev!.slot_index;
  return { slot, moves: shiftedBy(row, movedId, slot, slots) };
}

/**
 * What the core does for `PUT placement` with `shift: true`: the moved book leaves its old slot, the
 * contiguous run from `slot` slides one slot right; when the run reaches the end of a row the book
 * is moving right in, the books between its old slot and `slot` slide left instead. The moved book
 * comes last. Empty when the core answers `row_full`.
 */
export function shiftedBy(row: ShelfBook[], movedId: string, slot: number, slots: number): Move[] {
  const old = row.find((b) => b.book_id === movedId);
  const others = row.filter((b) => b.book_id !== movedId);
  const run: ShelfBook[] = [];
  let next = slot;
  for (const b of others.filter((o) => o.slot_index >= slot)) {
    if (b.slot_index !== next) break;
    run.push(b);
    next += 1;
  }
  const overflow = next >= slots && run.length > 0;
  let moves: Move[];
  if (overflow && old && old.slot_index < slot) {
    moves = others
      .filter((o) => o.slot_index > old.slot_index && o.slot_index <= slot)
      .map((o) => ({ bookId: o.book_id, slot: o.slot_index - 1 }));
  } else if (overflow) {
    return [];
  } else {
    moves = run.map((o) => ({ bookId: o.book_id, slot: o.slot_index + 1 }));
  }
  return [...moves, { bookId: movedId, slot }];
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
