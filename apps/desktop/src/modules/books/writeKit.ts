import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BookOut } from '@bookeeper/api';
import type { FakePlatform } from '../../platform/testing';
import { ok } from '../../session/fixtures';
import { book, renderBooks, type Library } from './testkit';

type Req = { method: string; path: string; body?: unknown };
export const ISBN = '9788845292613';

export const METADATA = {
  title: 'Il nome della rosa',
  subtitle: null,
  authors: ['Umberto Eco'],
  publisher: 'Bompiani',
  published_year: 1980,
  page_count: 503,
  language: 'it',
  description: 'Un monastero.',
  genre: 'Narrativa',
  isbn_13: ISBN,
  isbn_10: null,
  cover_candidates: ['https://covers.example/rosa.jpg'],
  sources: ['google-books', 'open-library'],
};

/** Answers for the write routes; `routes` adds or replaces answers by "METHOD /path". */
export function writeRoutes(routes: Record<string, (r: Req) => { status: number; body: unknown }> = {}) {
  return (r: Req) => {
    const path = r.path.split('?')[0]!;
    const own = routes[`${r.method} ${path}`];
    if (own) return own(r);
    if (r.method === 'GET' && path === '/api/v1/books/next-progressive') return ok({ next: 7 });
    if (r.method === 'GET' && path === `/api/v1/lookup/isbn/${ISBN}`) return ok(METADATA);
    if (r.method === 'POST' && path === '/api/v1/books') return { status: 201, body: book(99, { ...(r.body as object), id: 'new' }) };
    if (r.method === 'POST' && path === '/api/v1/books/new/cover/fetch') return ok({ cover_color: '#123456', source_url: 'x' });
    if (r.method === 'PATCH' || r.method === 'DELETE') return undefined;
    return undefined;
  };
}

export function renderWithWrites(lib: Omit<Library, 'extra'>, routes: Parameters<typeof writeRoutes>[0] = {}, route = '/books') {
  const handler = writeRoutes(routes);
  const view = renderBooks({ ...lib, extra: (r) => handler(r) }, route);
  return view;
}

export const sent = (platform: FakePlatform, method: string, start: string) =>
  platform.calls.filter((c) => c.method === method && c.path.split('?')[0]!.startsWith(start));

export async function openNewBook() {
  await userEvent.click(await screen.findByRole('button', { name: 'Aggiungi' }));
  return screen.findByRole('dialog', { name: 'Nuovo libro' });
}

export async function lookUp(isbn = ISBN) {
  await userEvent.type(screen.getByRole('textbox', { name: 'ISBN' }), isbn);
  await userEvent.click(screen.getByRole('button', { name: 'Cerca' }));
}

export const stored = (over: Partial<BookOut> = {}) =>
  book(1, { title: 'Dune', authors: ['Frank Herbert'], publisher: 'Nord', page_count: 500, ...over });
