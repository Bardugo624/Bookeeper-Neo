import type { ReadingOut } from '@bookeeper/api';
import { book, renderBooks, type Library } from '../books/testkit';
import { ok } from '../../session/fixtures';

type Req = { method: string; path: string; body?: unknown };
type Answer = { status: number; body: unknown } | undefined;

export const reading = (over: Partial<ReadingOut> = {}): ReadingOut => ({
  book_id: 'b1',
  status: 'reading',
  started_at: 1_700_000_000,
  finished_at: null,
  rating: null,
  note: null,
  current_page: 312,
  updated_at: 1_700_000_000,
  ...over,
});

export const rosa = (over = {}) => book(1, { title: 'Il nome della rosa', page_count: 503, ...over });

/** One caller's state of book `b1`, kept in memory; `PUT` echoes the body unless `refuse` answers. */
export function renderReading(
  initial: ReadingOut | null,
  opts: { books?: Library['books']; role?: Library['role']; refuse?: (body: Record<string, unknown>) => Answer; route?: string } = {},
) {
  const state = { current: initial };
  const view = renderBooks(
    {
      books: opts.books ?? [rosa()],
      role: opts.role,
      extra: (r: Req) => {
        if (!/^\/api\/v1\/books\/b1\/reading$/.test(r.path)) return undefined;
        if (r.method === 'GET') return ok(state.current);
        if (r.method === 'DELETE') {
          state.current = null;
          return { status: 204, body: undefined };
        }
        if (r.method === 'PUT') {
          const body = r.body as Record<string, unknown>;
          const refused = opts.refuse?.(body);
          if (refused) return refused;
          state.current = { ...reading({ current_page: null, started_at: null }), ...body, updated_at: 1_700_000_100 } as ReadingOut;
          return ok(state.current);
        }
        return undefined;
      },
    },
    opts.route ?? '/books/b1',
  );
  return { ...view, state };
}
