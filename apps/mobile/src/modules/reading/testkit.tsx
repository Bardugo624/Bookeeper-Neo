import type { ReadingOut } from '@bookeeper/api';
import type { RecordedCall } from '../../platform/testing';
import { ok } from '../../session/fixtures';
import { book, renderSearch } from '../search/testkit';

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

type Answer = { status: number; body: unknown };

export interface ReadingServer {
  current: ReadingOut | null;
  /** Answers a `PUT` instead of echoing it; return `undefined` to echo. */
  put?: (body: Record<string, unknown>, call: RecordedCall) => Answer | Promise<Answer> | undefined;
  /** Makes `GET` fail. */
  failGet?: boolean;
  /** Makes `DELETE` fail. */
  failDelete?: boolean;
}

export const isReading = (c: RecordedCall) => /\/books\/b1\/reading$/.test(c.path);
export const puts = (calls: RecordedCall[]) => calls.filter((c) => c.method === 'PUT' && isReading(c));

/** The book page of `b1` (503 pages unless told otherwise), with its reading state kept in memory. */
export function renderBlock(server: ReadingServer, over: Parameters<typeof book>[1] = {}) {
  const b = book(1, { id: 'b1', page_count: 503, ...over });
  const view = renderSearch({
    api: {
      books: [b],
      override: async (call) => {
        if (!isReading(call)) return undefined;
        if (call.method === 'GET') {
          return server.failGet ? { status: 500, body: { error_code: 'internal', message: 'x' } } : ok(server.current);
        }
        if (call.method === 'DELETE') {
          if (server.failDelete) return { status: 500, body: { error_code: 'internal', message: 'x' } };
          server.current = null;
          return { status: 204, body: undefined };
        }
        const body = call.body as Record<string, unknown>;
        const own = await server.put?.(body, call);
        if (own) return own;
        server.current = { ...reading({ current_page: null, started_at: null }), ...body, updated_at: 1_700_000_100 } as ReadingOut;
        return ok(server.current);
      },
    },
    route: '/books/b1',
  });
  return view;
}
