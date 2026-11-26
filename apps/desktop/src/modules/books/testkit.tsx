import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { BookFacets, BookOut, RawResponse } from '@bookeeper/api';
import { renderApp } from '../../app/testing';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../platform/testing';
import { ME, ok } from '../../session/fixtures';
import type { Connections } from '../../platform/types';
import { module } from './routes';

export function book(i: number, over: Partial<BookOut> = {}): BookOut {
  return {
    id: `b${i}`,
    title: `Libro ${i}`,
    authors: [`Autore ${i}`],
    on_loan: false,
    tags: [],
    reading: null,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

export const makeDb = (n: number): BookOut[] => Array.from({ length: n }, (_, i) => book(i + 1));

/** Facets of a small library: two rooms, two shelves, two tags. */
export const FACETS: BookFacets = {
  genres: [
    { value: 'Giallo', count: 4 },
    { value: 'Fantasy', count: 2 },
  ],
  languages: [
    { value: 'it', count: 5 },
    { value: 'en', count: 1 },
  ],
  formats: [{ value: 'paperback', count: 5 }],
  years: { min: 1950, max: 2020 },
  tags: [
    { id: 't1', name: 'Preferiti', color: '#888888', count: 3 },
    { id: 't2', name: 'Regalo', color: '#777777', count: 1 },
  ],
  rooms: [
    { id: 'r1', name: 'Studio', count: 3 },
    { id: 'r2', name: 'Camera', count: 2 },
  ],
  shelves: [
    { id: 's1', name: 'Salotto', count: 2 },
    { id: 's2', name: 'Libreria', count: 3 },
  ],
  reading: { to_read: 1, reading: 2, read: 3, abandoned: 0, none: 4 },
  owners: [],
  owner_none: 0,
};

/** Shelves of `FACETS`: Salotto is in Camera, Libreria in Studio. */
export const FACET_SHELVES = [
  { id: 's1', name: 'Salotto', color: '#888', room_id: 'r2', room: { id: 'r2', name: 'Camera' } },
  { id: 's2', name: 'Libreria', color: '#888', room_id: 'r1', room: { id: 'r1', name: 'Studio' } },
];

const notFound = { status: 404, body: { error_code: 'not_found', message: 'x' } };

export interface Library {
  books: BookOut[];
  cover?: { bytes: Uint8Array; etag: string };
  fail?: { on: boolean };
  role?: 'owner' | 'member' | 'guest';
  /** Answer of `GET /books/facets`. */
  facets?: BookFacets;
  /** Answer of `GET /shelves`; one shelf by default. */
  shelves?: unknown[];
  /** Answers first; return undefined to fall through to the in-memory library. */
  extra?: (r: { method: string; path: string; body?: unknown }) => { status: number; body: unknown } | undefined;
  /** Raw (binary) requests that reached the transport, e.g. cover uploads. */
  raw?: Array<{ method: string; path: string; bytes?: Uint8Array }>;
}

/** Handler that answers `/me`, `/books`, `/books/:id` and `/shelves` from an in-memory list. */
export function libraryHandler(lib: Library) {
  return (r: { method: string; path: string; body?: unknown }) => {
    const own = lib.extra?.(r);
    if (own) return own;
    const url = new URL(r.path, 'http://x');
    const p = url.pathname;
    const q = url.searchParams;
    if (p === '/api/v1/me') return ok({ ...ME, user: { ...ME.user, role: lib.role ?? 'owner' } });
    if (p === '/api/v1/shelves') return ok({ items: lib.shelves ?? [{ id: 's1', name: 'Salotto', color: '#888' }] });
    if (p === '/api/v1/books/facets') return ok(lib.facets ?? FACETS);
    if (p === '/api/v1/books') {
      if (lib.fail?.on) return { status: 500, body: { error_code: 'internal', message: 'x' } };
      let rows = lib.books;
      if (q.get('on_loan') === 'true') rows = rows.filter((b) => b.on_loan);
      if (q.get('reading')) rows = rows.filter((b) => b.reading?.status === q.get('reading'));
      for (const id of q.getAll('tag_id')) rows = rows.filter((b) => b.tags.some((tag) => tag.id === id));
      if (q.get('unshelved') === 'true') rows = rows.filter((b) => !b.placement);
      const text = q.get('q');
      if (text) rows = rows.filter((b) => [b.title, b.isbn_13, b.isbn_10].some((f) => f?.toLowerCase().includes(text.toLowerCase())));
      const offset = Number(q.get('offset') ?? 0);
      const limit = Number(q.get('limit') ?? 50);
      return ok({ items: rows.slice(offset, offset + limit), total: rows.length });
    }
    if (/^\/api\/v1\/books\/[^/]+\/reading$/.test(p)) return ok(null);
    const m = /^\/api\/v1\/books\/([^/]+)$/.exec(p);
    if (m) {
      const found = lib.books.find((b) => b.id === decodeURIComponent(m[1]!));
      return found ? ok(found) : notFound;
    }
    return notFound;
  };
}

export function booksPlatform(lib: Library, connections?: Connections): FakePlatform {
  const platform = fakePlatform({
    connections: connections ?? { active: 'c1', items: [fakeConnection()] },
    handler: libraryHandler(lib),
  });
  const base = platform.transport.bind(platform);
  // The fake transport has no raw channel: cover requests go through here.
  platform.transport = (id) => ({
    ...base(id),
    async requestRaw(req): Promise<RawResponse> {
      platform.calls.push({ method: req.method, path: req.path, headers: req.headers });
      if (req.method === 'PUT') {
        lib.raw?.push({ method: req.method, path: req.path, bytes: req.body });
        const bytes = new TextEncoder().encode(JSON.stringify({ cover_color: '#112233' }));
        return { status: 200, bytes, contentType: 'application/json', headers: {} as Record<string, string> };
      }
      if (!lib.cover || !req.path.endsWith('/b1/cover')) {
        const bytes = new TextEncoder().encode(JSON.stringify({ error_code: 'not_found', message: 'x' }));
        return { status: 404, bytes, contentType: 'application/json', headers: {} as Record<string, string> };
      }
      return { status: 200, bytes: lib.cover.bytes, contentType: 'image/jpeg', headers: { etag: lib.cover.etag } };
    },
  });
  return platform;
}

export function renderBooks(lib: Library, route = '/books', connections?: Connections) {
  const platform = booksPlatform(lib, connections);
  return { ...renderApp({ platform, modules: [module], route }), platform };
}

/** Paths of the list requests sent so far. */
export function listCalls(platform: FakePlatform): URLSearchParams[] {
  return platform.calls
    .filter((c) => c.method === 'GET' && c.path.startsWith('/api/v1/books?'))
    .map((c) => new URL(c.path, 'http://x').searchParams);
}

interface FakeObserver {
  cb: IntersectionObserverCallback;
  el: Element | null;
}
const observers = new Set<FakeObserver>();

class FakeIntersectionObserver {
  private readonly self: FakeObserver;
  constructor(cb: IntersectionObserverCallback) {
    this.self = { cb, el: null };
    observers.add(this.self);
  }
  observe(el: Element) {
    this.self.el = el;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
  disconnect() {
    observers.delete(this.self);
  }
}

export function installIntersectionObserver() {
  observers.clear();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
}

/** Reports every watched element as in view. */
export function scrollToEnd() {
  act(() => {
    for (const o of [...observers]) {
      if (o.el) o.cb([{ isIntersecting: true, target: o.el } as IntersectionObserverEntry], {} as IntersectionObserver);
    }
  });
}
