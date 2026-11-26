import type { TagOut } from '@bookeeper/api';
import type { RecordedCall } from '../../platform/testing';
import { ME, ok } from '../../session/fixtures';
import { book, renderSearch } from '../search/testkit';

export const tag = (n: number, over: Partial<TagOut> = {}): TagOut => ({
  id: `t${n}`,
  name: `Tag ${n}`,
  color: 'sage',
  book_count: 0,
  ...over,
});

export interface TagsServer {
  tags: TagOut[];
  /** Answers the `PUT` instead of echoing; return `undefined` to echo. */
  put?: (call: RecordedCall) => { status: number; body: unknown } | undefined;
  /** Makes `POST /tags` fail. */
  failCreate?: boolean;
  /** Makes `GET /tags` fail. */
  failList?: boolean;
  role?: 'owner' | 'admin' | 'member' | 'guest';
}

export const isPut = (c: RecordedCall) => c.method === 'PUT' && /\/books\/b1\/tags$/.test(c.path);
export const isCreate = (c: RecordedCall) => c.method === 'POST' && /\/tags$/.test(c.path);
const refuse = { status: 500, body: { error_code: 'internal', message: 'x' } };

/** The page of book `b1`, carrying `have`, with the library tags kept in memory. */
export function renderTags(server: TagsServer, have: TagOut[] = []) {
  const b = book(1, { id: 'b1', tags: have.map(({ id, name, color }) => ({ id, name, color })) } as never);
  return renderSearch({
    api: {
      books: [b],
      override: async (call) => {
        const path = call.path.replace('/api/v1', '');
        if (path === '/me') return ok({ ...ME, user: { ...ME.user, role: server.role ?? 'owner' } });
        if (path === '/tags' && call.method === 'GET') return server.failList ? refuse : ok({ items: server.tags });
        if (isCreate(call)) {
          if (server.failCreate) return refuse;
          const body = call.body as { name: string; color: string };
          const made = tag(server.tags.length + 1, { id: `n${server.tags.length + 1}`, ...body });
          server.tags = [...server.tags, made];
          return { status: 201, body: made };
        }
        if (isPut(call)) return server.put?.(call) ?? ok({ ...b, tags: [] });
        return undefined;
      },
    },
    route: '/books/b1',
  });
}
