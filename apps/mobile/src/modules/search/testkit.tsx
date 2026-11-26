import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { TransportResponse } from '@bookeeper/api';
import type { BookOut } from '@bookeeper/api';
import { renderMobile } from '../../app/testing';
import { fakePlatform, type FakePlatform, type Handler, type RawHandler, type RecordedCall } from '../../platform/testing';
import { ME, ok, pair } from '../../session/fixtures';
import { module } from './routes';

export const book = (n: number, over: Partial<BookOut> = {}): BookOut =>
  ({
    id: `b${n}`,
    title: `Libro ${n}`,
    authors: [`Autore ${n}`],
    on_loan: false,
    created_at: n,
    updated_at: n,
    ...over,
  }) as BookOut;

export interface Api {
  books: BookOut[];
  shelves?: { id: string; name: string }[];
  /** Books on each piece of furniture, by shelf id; a shelf listed here is drawn as 3 rows of 16 places. */
  shelfBooks?: Record<string, { book_id: string; title: string; row_index: number; slot_index: number }[]>;
  rooms?: { id: string; name: string }[];
  /** Answer of `GET /books/facets`; absent means an empty library. */
  facets?: { tags?: { id: string; name: string; color: string; count: number }[]; reading?: Partial<Record<string, number>> };
  /** Reading state of each book, by id, for the `reading` filter. */
  reading?: Record<string, string>;
  /** Replaces the answer of the list or detail endpoints. */
  override?: (call: RecordedCall) => TransportResponse | undefined | Promise<TransportResponse | undefined>;
}

/** An in-memory server: `/me`, the book list (q, on_loan, unshelved, paging), a book, the shelves. */
export function apiHandler(api: Api): Handler {
  return async (call) => {
    const own = await api.override?.(call);
    if (own) return own;
    const url = new URL(call.path, 'http://x');
    if (url.pathname === '/api/v1/me') return ok(ME);
    if (url.pathname === '/api/v1/rooms') {
      const items = (api.rooms ?? []).map((r) => ({ ...r, shelf_count: 0, created_at: 1 }));
      return ok({ items, total: items.length });
    }
    if (url.pathname === '/api/v1/books/facets') {
      const f = api.facets ?? {};
      const reading = { to_read: 0, reading: 0, read: 0, abandoned: 0, none: 0, ...f.reading };
      return ok({ formats: [], genres: [], languages: [], rooms: [], shelves: [], years: {}, tags: f.tags ?? [], reading });
    }
    if (url.pathname === '/api/v1/shelves') return ok({ items: api.shelves ?? [], total: 0 });
    const shelfBooks = /^\/api\/v1\/shelves\/([^/]+)\/books$/.exec(url.pathname);
    if (shelfBooks) {
      const items = (api.shelfBooks?.[decodeURIComponent(shelfBooks[1]!)] ?? []).map((b) => ({ authors: [], ...b }));
      return ok({ items });
    }
    const shelf = /^\/api\/v1\/shelves\/([^/]+)$/.exec(url.pathname);
    if (shelf) {
      const found = (api.shelves ?? []).find((s) => s.id === decodeURIComponent(shelf[1]!));
      if (!found) return { status: 404, body: { error_code: 'not_found', message: 'x' } };
      const count = (api.shelfBooks?.[found.id] ?? []).length;
      return ok({ ...found, color: 'sage', rows: 3, slots_per_row: 16, capacity: 48, book_count: count, label_code: 1, created_at: 1, updated_at: 1 });
    }
    const one = /^\/api\/v1\/books\/([^/]+)$/.exec(url.pathname);
    if (one) {
      const found = api.books.find((b) => b.id === decodeURIComponent(one[1]!));
      return found
        ? ok(found)
        : { status: 404, body: { error_code: 'not_found', message: 'no such book' } };
    }
    if (url.pathname === '/api/v1/books') {
      const q = url.searchParams.get('q')?.toLowerCase();
      let list = api.books;
      if (q) list = list.filter((b) => b.title.toLowerCase().includes(q));
      if (url.searchParams.get('on_loan') === 'true') list = list.filter((b) => b.on_loan);
      if (url.searchParams.get('unshelved') === 'true') list = list.filter((b) => !b.placement);
      const reading = url.searchParams.get('reading');
      if (reading) list = list.filter((b) => (api.reading?.[b.id] ?? 'none') === reading);
      const tagIds = url.searchParams.getAll('tag_id');
      if (tagIds.length) list = list.filter((b) => tagIds.every((id) => (b.tags ?? []).some((x) => x.id === id)));
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 50);
      return ok({ items: list.slice(offset, offset + limit), total: list.length, limit, offset });
    }
    return { status: 404, body: { error_code: 'not_found', message: 'x' } };
  };
}

export interface RenderOptions {
  api?: Api;
  handler?: Handler;
  rawHandler?: RawHandler;
  route?: string;
  online?: boolean;
}

/** The app with only the search module, paired, on `route`. */
export function renderSearch({ api = { books: [] }, handler, rawHandler, route = '/search', online }: RenderOptions = {}) {
  const platform: FakePlatform = fakePlatform({ handler: handler ?? apiHandler(api), rawHandler, online });
  pair(platform.storage);
  return renderMobile({ platform, modules: [module], route });
}

/** Paths of the book-list requests made so far, with their query strings. */
export const listCalls = (platform: FakePlatform) =>
  platform.fake.calls.filter((c) => c.path.startsWith('/api/v1/books?')).map((c) => c.path);

/** Replaces `IntersectionObserver`; `reach()` tells every observer that its element is in view. */
export function stubObserver({ reportOnObserve = false } = {}) {
  const callbacks = new Set<IntersectionObserverCallback>();
  class Stub {
    constructor(cb: IntersectionObserverCallback) {
      callbacks.add(cb);
      this.cb = cb;
    }
    cb: IntersectionObserverCallback;
    observe() {
      if (reportOnObserve) this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    unobserve() {}
    disconnect() {
      callbacks.delete(this.cb);
    }
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', Stub);
  return {
    reach: () =>
      act(() => {
        for (const cb of [...callbacks]) cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      }),
  };
}
