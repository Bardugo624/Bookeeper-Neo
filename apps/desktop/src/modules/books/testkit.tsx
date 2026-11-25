import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { BookOut, RawResponse } from '@bookeeper/api';
import { renderApp } from '../../app/testing';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../platform/testing';
import { ME, ok } from '../../session/fixtures';
import { module } from './routes';

export function book(i: number, over: Partial<BookOut> = {}): BookOut {
  return {
    id: `b${i}`,
    title: `Libro ${i}`,
    authors: [`Autore ${i}`],
    on_loan: false,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

export const makeDb = (n: number): BookOut[] => Array.from({ length: n }, (_, i) => book(i + 1));

const notFound = { status: 404, body: { error_code: 'not_found', message: 'x' } };

export interface Library {
  books: BookOut[];
  cover?: { bytes: Uint8Array; etag: string };
  fail?: { on: boolean };
}

/** Handler that answers `/me`, `/books`, `/books/:id` and `/shelves` from an in-memory list. */
export function libraryHandler(lib: Library) {
  return (r: { method: string; path: string }) => {
    const url = new URL(r.path, 'http://x');
    const p = url.pathname;
    const q = url.searchParams;
    if (p === '/api/v1/me') return ok(ME);
    if (p === '/api/v1/shelves') return ok({ items: [{ id: 's1', name: 'Salotto', color: '#888' }] });
    if (p === '/api/v1/books') {
      if (lib.fail?.on) return { status: 500, body: { error_code: 'internal', message: 'x' } };
      let rows = lib.books;
      if (q.get('on_loan') === 'true') rows = rows.filter((b) => b.on_loan);
      if (q.get('unshelved') === 'true') rows = rows.filter((b) => !b.placement);
      const text = q.get('q');
      if (text) rows = rows.filter((b) => b.title.toLowerCase().includes(text.toLowerCase()));
      const offset = Number(q.get('offset') ?? 0);
      const limit = Number(q.get('limit') ?? 50);
      return ok({ items: rows.slice(offset, offset + limit), total: rows.length });
    }
    const m = /^\/api\/v1\/books\/([^/]+)$/.exec(p);
    if (m) {
      const found = lib.books.find((b) => b.id === decodeURIComponent(m[1]!));
      return found ? ok(found) : notFound;
    }
    return notFound;
  };
}

export function booksPlatform(lib: Library): FakePlatform {
  const platform = fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: libraryHandler(lib),
  });
  const base = platform.transport.bind(platform);
  // The fake transport has no raw channel: cover requests go through here.
  platform.transport = (id) => ({
    ...base(id),
    async requestRaw(req): Promise<RawResponse> {
      platform.calls.push({ method: req.method, path: req.path, headers: req.headers });
      if (!lib.cover || !req.path.endsWith('/b1/cover')) {
        const bytes = new TextEncoder().encode(JSON.stringify({ error_code: 'not_found', message: 'x' }));
        return { status: 404, bytes, contentType: 'application/json', headers: {} as Record<string, string> };
      }
      return { status: 200, bytes: lib.cover.bytes, contentType: 'image/jpeg', headers: { etag: lib.cover.etag } };
    },
  });
  return platform;
}

export function renderBooks(lib: Library, route = '/books') {
  const platform = booksPlatform(lib);
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
