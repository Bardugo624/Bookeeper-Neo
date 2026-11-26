import type { BookOut, ShelfBook, ShelfOut } from '@bookeeper/api';
import type { RecordedCall } from '../../platform/testing';
import { ISBN13, book, err, scanPlatform, type Server } from './testkit';
import { ok } from '../../session/fixtures';

export { ISBN13 };

export const SLOTS = 4;

export const unit = (over: Partial<ShelfOut> = {}): ShelfOut =>
  ({
    id: 's1',
    name: 'Libreria',
    color: 'sage',
    rows: 2,
    slots_per_row: SLOTS,
    book_count: 0,
    capacity: 2 * SLOTS,
    room: { id: 'r1', name: 'Salotto' },
    room_id: 'r1',
    created_at: 1,
    updated_at: 1,
    label_code: 1,
    ...over,
  }) as ShelfOut;

/** Valid ISBN-13s that differ from each other. */
export const CODES = ['9780306406157', '9780131103627', '9780201633610', '9780596007126', '9781491950296'];

export interface ShelfWorld {
  shelves: ShelfOut[];
  /** Placements by book id. */
  placed: Record<string, { shelf_id: string; row_index: number; slot_index: number }>;
  books: BookOut[];
  /** Books of a shelf in `GET /shelves/{id}/books`, derived from `placed`. */
  deleted: string[];
  /** Make the next placements fail with this error. */
  failNext?: { status: number; code: string }[];
}

const shelfBooks = (w: ShelfWorld, id: string): ShelfBook[] =>
  Object.entries(w.placed)
    .filter(([, p]) => p.shelf_id === id)
    .map(([bookId, p]) => ({
      book_id: bookId,
      title: w.books.find((b) => b.id === bookId)?.title ?? bookId,
      authors: [],
      row_index: p.row_index,
      slot_index: p.slot_index,
    }));

/** The book reads its placement from the world, so a move shows in later lookups. */
function track(w: ShelfWorld, row: BookOut): BookOut {
  Object.defineProperty(row, 'placement', { get: () => w.placed[row.id], enumerable: true, configurable: true });
  return row;
}

/** An in-memory shelf server with the append rule of `PUT /books/{id}/placement`. */
export function world(over: Partial<ShelfWorld> = {}): ShelfWorld {
  return { shelves: [unit()], placed: {}, books: [], deleted: [], ...over };
}

export function shelfServer(w: ShelfWorld, s: Server = {}): Server {
  const create = s.create;
  return {
    ...s,
    books: w.books,
    create: (body) => {
      const made = create ? create(body) : undefined;
      if (made && 'status' in made && made.status !== 200) return made;
      const b = body as { title: string; isbn_13?: string };
      const row = track(w, book({ id: `n${w.books.length}`, title: b.title, isbn_13: b.isbn_13 }));
      w.books.push(row);
      return ok(row);
    },
    extra: (call: RecordedCall) => {
      const path = call.path.split('?')[0]!;
      if (path === '/api/v1/shelves' && call.method === 'GET') return ok({ items: w.shelves, total: w.shelves.length });
      const sb = /^\/api\/v1\/shelves\/([^/]+)\/books$/.exec(path);
      if (sb) return ok({ items: shelfBooks(w, sb[1]!) });
      const pl = /^\/api\/v1\/books\/([^/]+)\/placement$/.exec(path);
      if (pl && call.method === 'DELETE') {
        delete w.placed[pl[1]!];
        return { status: 204, body: null };
      }
      if (pl && call.method === 'PUT') {
        const failure = w.failNext?.shift();
        if (failure) return err(failure.status, failure.code);
        const id = pl[1]!;
        const body = call.body as { shelf_id: string; row_index: number; slot_index?: number };
        const shelf = w.shelves.find((x) => x.id === body.shelf_id)!;
        const here = shelfBooks(w, body.shelf_id).filter((b) => b.row_index === body.row_index);
        let slot = body.slot_index;
        const mine = w.placed[id];
        if (slot === undefined) {
          if (mine && mine.shelf_id === body.shelf_id && mine.row_index === body.row_index) return ok(mine);
          slot = here.reduce((n, b) => Math.max(n, b.slot_index + 1), 0);
          if (slot >= shelf.slots_per_row) return err(409, 'row_full');
        }
        w.placed[id] = { shelf_id: body.shelf_id, row_index: body.row_index, slot_index: slot };
        return ok(w.placed[id]);
      }
      const del = /^\/api\/v1\/books\/([^/]+)$/.exec(path);
      if (del && call.method === 'DELETE') {
        w.deleted.push(del[1]!);
        const at = w.books.findIndex((b) => b.id === del[1]);
        if (at >= 0) w.books.splice(at, 1);
        delete w.placed[del[1]!];
        return { status: 204, body: null };
      }
      return undefined;
    },
  };
}

/** A library book that carries its placement from the world. */
export function owned(w: ShelfWorld, n: number, at?: { shelf_id: string; row_index: number; slot_index: number }): BookOut {
  const row = track(w, book({ id: `b${n}`, title: `Libro ${n}`, isbn_13: CODES[n - 1] }));
  if (at) w.placed[row.id] = at;
  w.books.push(row);
  return row;
}

export function shelfPlatform(w: ShelfWorld, s: Server = {}) {
  return scanPlatform(shelfServer(w, s));
}
