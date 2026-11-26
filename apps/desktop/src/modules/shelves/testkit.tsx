import type { BookOut, RoomOut, ShelfOut } from '@bookeeper/api';
import { renderApp } from '../../app/testing';
import type { AppModule } from '../../app';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../platform/testing';
import { ME, ok } from '../../session/fixtures';
import { book as makeBook } from '../books/testkit';
import { module } from './routes';

// jsdom lacks ResizeObserver, which the tooltip of a spine needs.
// Radix Select needs these.
const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
proto.hasPointerCapture ??= () => false;
proto.setPointerCapture ??= () => undefined;
proto.releasePointerCapture ??= () => undefined;
proto.scrollIntoView ??= () => undefined;

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

export function shelf(i: number, over: Partial<ShelfOut> = {}): ShelfOut {
  return {
    id: `s${i}`, name: `Mobile ${i}`, rows: 2, slots_per_row: 10, color: 'sage', icon: null, label_code: i, room_id: null,
    capacity: 20, book_count: 0, created_at: 0, updated_at: 0, ...over,
  };
}

export function book(id: string, over: Partial<BookOut> = {}): BookOut {
  return { ...makeBook(0), id, title: `Libro ${id}`, authors: [`Autore ${id}`], ...over };
}

export function room(id: string, name: string): RoomOut {
  return { id, name, shelf_count: 0, created_at: 0 };
}

export interface Spot {
  shelf: string;
  row: number;
  slot: number;
}

export interface World {
  shelves: ShelfOut[];
  books: BookOut[];
  rooms?: RoomOut[];
  /** Placement of each placed book id. */
  spots: Record<string, Spot>;
  role?: 'owner' | 'member' | 'guest';
  /** Status for every placement write instead of success. */
  placeFails?: number;
  /** Placement writes of this book id get `409 slot_taken`, once. */
  takenOnce?: string;
  listFails?: boolean;
  /** Never answers the shelf list. */
  listPending?: boolean;
  /** A write to the shelf routes that the core refuses. */
  refuse?: { method: string; status: number; code: string };
  /** Placement writes wait for this before answering. */
  gate?: Promise<void>;
}

const err = (status: number, code: string) => ({ status, body: { error_code: code, message: 'x' } });

function withCounts(w: World): ShelfOut[] {
  return w.shelves.map((s) => ({
    ...s,
    room: w.rooms?.find((r) => r.id === s.room_id) ? { id: s.room_id!, name: w.rooms.find((r) => r.id === s.room_id)!.name } : null,
    book_count: Object.values(w.spots).filter((p) => p.shelf === s.id).length,
  }));
}

function roomsRoute(w: World, method: string, path: string, body: unknown) {
  const rooms = (w.rooms ??= []);
  const count = (id: string) => w.shelves.filter((s) => s.room_id === id).length;
  const out = (r: RoomOut) => ({ ...r, shelf_count: count(r.id) });
  const name = (body as { name?: string } | undefined)?.name?.trim() ?? '';
  const clash = (except?: string) => rooms.some((r) => r.id !== except && r.name.toLowerCase() === name.toLowerCase());
  if (path === '/api/v1/rooms') {
    if (method === 'GET') return ok({ items: rooms.map(out) });
    if (clash()) return err(409, 'room_exists');
    const made = room(`rnew${rooms.length + 1}`, name);
    rooms.push(made);
    return { status: 201, body: out(made) };
  }
  const found = rooms.find((r) => r.id === path.split('/').pop());
  if (!found) return err(404, 'not_found');
  if (method === 'PATCH') {
    if (clash(found.id)) return err(409, 'room_exists');
    found.name = name;
    return ok(out(found));
  }
  w.rooms = rooms.filter((r) => r !== found);
  w.shelves = w.shelves.map((s) => (s.room_id === found.id ? { ...s, room_id: null } : s));
  return { status: 204, body: undefined };
}

/** An in-memory core: the shelf, book and placement routes the module uses. */
export function shelvesPlatform(w: World): FakePlatform {
  const me = { ...ME, user: { ...ME.user, role: w.role ?? 'owner' } };
  return fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: async (r) => {
      const [p, query = ''] = r.path.split('?');
      const q = new URLSearchParams(query);
      if (p === '/api/v1/me') return ok(me);
      if (w.refuse && r.method === w.refuse.method && p!.startsWith('/api/v1/shelves')) return err(w.refuse.status, w.refuse.code);
      if (p === '/api/v1/rooms' || p!.startsWith('/api/v1/rooms/')) return roomsRoute(w, r.method, p!, r.body);
      if (p === '/api/v1/shelves' && r.method === 'GET') {
        if (w.listPending) await new Promise(() => {});
        return w.listFails ? err(500, 'internal') : ok({ items: withCounts(w) });
      }
      if (p === '/api/v1/shelves' && r.method === 'POST') {
        const body = r.body as Partial<ShelfOut>;
        const made = shelf(w.shelves.length + 1, { ...body, id: 'snew' });
        w.shelves = [...w.shelves, made];
        return { status: 201, body: made };
      }
      if (p === '/api/v1/books') {
        const text = (q.get('q') ?? '').toLowerCase();
        const items = w.books.filter((b) => !w.spots[b.id] && b.title.toLowerCase().includes(text));
        return ok({ items, total: items.length });
      }
      let m = /^\/api\/v1\/shelves\/([^/]+)(\/books)?$/.exec(p!);
      if (m) {
        const found = w.shelves.find((s) => s.id === m![1]);
        if (!found) return err(404, 'not_found');
        if (m[2]) {
          const items = Object.entries(w.spots)
            .filter(([, s]) => s.shelf === found.id)
            .map(([id, s]) => {
              const b = w.books.find((x) => x.id === id)!;
              return { book_id: id, title: b.title, authors: b.authors, progressive_number: null, cover_color: null, row_index: s.row, slot_index: s.slot, spine_width: null };
            })
            .sort((a, b) => a.row_index - b.row_index || a.slot_index - b.slot_index);
          return ok({ items });
        }
        if (r.method === 'PATCH') {
          const next = { ...found, ...(r.body as object) } as ShelfOut;
          w.shelves = w.shelves.map((s) => (s === found ? next : s));
          return ok(next);
        }
        if (r.method === 'DELETE') {
          w.shelves = w.shelves.filter((s) => s !== found);
          for (const [id, s] of Object.entries(w.spots)) if (s.shelf === found.id) delete w.spots[id];
          return { status: 204, body: undefined };
        }
        return ok(withCounts(w).find((s) => s.id === found.id));
      }
      m = /^\/api\/v1\/books\/([^/]+)\/placement$/.exec(p!);
      if (m) {
        if (r.method === 'DELETE') {
          delete w.spots[m[1]!];
          return { status: 204, body: undefined };
        }
        await w.gate;
        if (w.placeFails) return err(w.placeFails, w.placeFails === 409 ? 'slot_taken' : 'internal');
        if (w.takenOnce === m[1]) {
          w.takenOnce = undefined;
          return err(409, 'slot_taken');
        }
        const b = r.body as { shelf_id: string; row_index: number; slot_index: number; shift?: boolean };
        const id = m[1]!;
        const shelfOf = w.shelves.find((s) => s.id === b.shelf_id)!;
        const inTarget = (s: Spot) => s.shelf === b.shelf_id && s.row === b.row_index;
        const old = w.spots[id];
        const others = Object.entries(w.spots).filter(([other, s]) => other !== id && inTarget(s));
        const at = others.find(([, s]) => s.slot === b.slot_index);
        if (at && !b.shift) return err(409, 'slot_taken');
        if (at) {
          // The core's shift: the contiguous run from the slot slides right; at the end of the row it
          // slides left into the old slot instead when the book moves right inside the same row.
          const run: string[] = [];
          for (let n = b.slot_index; others.some(([, s]) => s.slot === n); n++) run.push(others.find(([, s]) => s.slot === n)![0]);
          if (b.slot_index + run.length >= shelfOf.slots_per_row) {
            if (!old || !inTarget(old) || old.slot > b.slot_index) return err(409, 'row_full');
            for (const [, s] of others) if (s.slot > old.slot && s.slot <= b.slot_index) s.slot -= 1;
          } else for (const other of run) w.spots[other]!.slot += 1;
        }
        w.spots[id] = { shelf: b.shelf_id, row: b.row_index, slot: b.slot_index };
        return ok({ shelf_id: b.shelf_id, row_index: b.row_index, slot_index: b.slot_index });
      }
      return err(404, 'not_found');
    },
  });
}

export function renderShelves(w: World, route = '/shelves', locale: 'it' | 'en' = 'it') {
  const platform = shelvesPlatform(w);
  const stub: AppModule = { id: 'books', routes: [{ path: '/books/:id', element: <p>Scheda libro</p> }] };
  return { ...renderApp({ platform, modules: [module, stub], route, locale }), platform };
}

/** The writes sent to the placement route, as [book id, row, slot]. */
export function placements(platform: FakePlatform): Array<[string, number, number]> {
  return platform.calls
    .filter((c) => c.method === 'PUT')
    .map((c) => {
      const b = c.body as { row_index: number; slot_index: number };
      return [/books\/([^/]+)\/placement/.exec(c.path)![1]!, b.row_index, b.slot_index];
    });
}

/** Every request sent to a placement route: method, path and whether it asked the core to shift. */
export function placementRequests(platform: FakePlatform): Array<{ method: string; shift: unknown }> {
  return platform.calls
    .filter((c) => /\/books\/[^/]+\/placement$/.test(c.path))
    .map((c) => ({ method: c.method, shift: (c.body as { shift?: unknown } | undefined)?.shift }));
}
