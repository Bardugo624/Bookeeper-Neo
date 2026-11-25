import type { BookOut, LoanOut, RawResponse } from '@bookeeper/api';
import type { AppModule } from '../../app';
import { renderApp } from '../../app/testing';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../platform/testing';
import { ME, ok } from '../../session/fixtures';
import { book } from '../books/testkit';
import { module } from './routes';

export const DAY = 86_400;

export function loan(i: number, over: Partial<LoanOut> = {}): LoanOut {
  return {
    id: `l${i}`,
    book_id: `b${i}`,
    book_title: `Libro ${i}`,
    book_authors: [`Autore ${i}`],
    borrower_name: `Persona ${i}`,
    borrower_user_id: null,
    lent_at: 1_700_000_000,
    due_at: null,
    returned_at: null,
    notes: null,
    overdue: false,
    ...over,
  };
}

export { book };

export interface Store {
  loans: LoanOut[];
  books: BookOut[];
  role?: 'owner' | 'member' | 'guest';
  /** Error answered to the next write (once). */
  failNext?: { status: number; code: string };
  failList?: boolean;
}

const notFound = { status: 404, body: { error_code: 'not_found', message: 'x' } };

/** Answers `/me`, `/loans…` and `/books` from memory. */
export function loansHandler(store: Store) {
  return (r: { method: string; path: string; body?: unknown }) => {
    const url = new URL(r.path, 'http://x');
    const p = url.pathname;
    const q = url.searchParams;
    if (p === '/api/v1/me') return ok({ ...ME, user: { ...ME.user, role: store.role ?? 'owner' } });
    if (p === '/api/v1/books') {
      let rows = store.books;
      if (q.get('on_loan') === 'false') rows = rows.filter((b) => !b.on_loan);
      const text = q.get('q');
      if (text) rows = rows.filter((b) => b.title.toLowerCase().includes(text.toLowerCase()));
      return ok({ items: rows.slice(0, Number(q.get('limit') ?? 50)), total: rows.length });
    }
    if (p === '/api/v1/loans/borrowers') {
      const prefix = (q.get('q') ?? '').toLowerCase();
      const names = [...new Set(store.loans.map((l) => l.borrower_name))].filter((n) => n.toLowerCase().startsWith(prefix));
      return ok({ items: names.slice(0, 10) });
    }
    if (p === '/api/v1/loans' && r.method === 'GET') {
      if (store.failList) return { status: 500, body: { error_code: 'internal', message: 'x' } };
      const status = q.get('status') ?? 'active';
      let rows = store.loans.filter((l) => {
        if (status === 'active') return l.returned_at == null;
        if (status === 'overdue') return l.returned_at == null && l.overdue;
        if (status === 'returned') return l.returned_at != null;
        return true;
      });
      if (q.get('book_id')) rows = rows.filter((l) => l.book_id === q.get('book_id'));
      const offset = Number(q.get('offset') ?? 0);
      return ok({ items: rows.slice(offset, offset + Number(q.get('limit') ?? 50)), total: rows.length });
    }
    if (r.method !== 'GET' && store.failNext) {
      const { status, code } = store.failNext;
      store.failNext = undefined;
      return { status, body: { error_code: code, message: 'x' } };
    }
    if (p === '/api/v1/loans' && r.method === 'POST') {
      const b = r.body as { book_id: string; borrower_name: string; lent_at?: number; due_at?: number; notes?: string };
      const made = loan(store.loans.length + 100, {
        book_id: b.book_id,
        borrower_name: b.borrower_name,
        lent_at: b.lent_at ?? 0,
        due_at: b.due_at ?? null,
        notes: b.notes ?? null,
      });
      store.loans.push(made);
      return { status: 201, body: made };
    }
    const m = /^\/api\/v1\/loans\/([^/]+)(\/return|\/reopen)?$/.exec(p);
    const found = m ? store.loans.find((l) => l.id === decodeURIComponent(m[1]!)) : undefined;
    if (!m || !found) return notFound;
    if (r.method === 'DELETE') {
      store.loans = store.loans.filter((l) => l !== found);
      return { status: 204, body: undefined };
    }
    if (m[2] === '/return') found.returned_at = (r.body as { returned_at?: number }).returned_at ?? 1;
    else if (m[2] === '/reopen') found.returned_at = null;
    else Object.assign(found, r.body);
    return ok(found);
  };
}

export function loansPlatform(store: Store): FakePlatform {
  const platform = fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: loansHandler(store),
  });
  const base = platform.transport.bind(platform);
  // The fake transport has no raw channel: covers are never stored here.
  platform.transport = (id) => ({
    ...base(id),
    async requestRaw(): Promise<RawResponse> {
      const bytes = new TextEncoder().encode(JSON.stringify({ error_code: 'not_found', message: 'x' }));
      return { status: 404, bytes, contentType: 'application/json', headers: {} as Record<string, string> };
    },
  });
  return platform;
}

export function renderLoans(store: Store, route = '/loans', extra: AppModule[] = []) {
  const platform = loansPlatform(store);
  return { ...renderApp({ platform, modules: [module, ...extra], route }), platform, store };
}

/** Requests that are not GET, in order. */
export function writes(platform: FakePlatform) {
  return platform.calls.filter((c) => c.method !== 'GET');
}

export function loanListCalls(platform: FakePlatform): URLSearchParams[] {
  return platform.calls
    .filter((c) => c.method === 'GET' && c.path.startsWith('/api/v1/loans?'))
    .map((c) => new URL(c.path, 'http://x').searchParams);
}
