import type { BookOut, WishOut } from '@bookeeper/api';
import { renderMobile } from '../../app/testing';
import { fakePlatform, type FakePlatform, type RecordedCall } from '../../platform/testing';
import { ME, ok, pair } from '../../session/fixtures';
import { module } from './routes';
import { module as search } from '../search/routes';

export const wish = (over: Partial<WishOut> = {}): WishOut =>
  ({
    id: 'w1',
    title: 'Dune',
    authors: 'Frank Herbert',
    priority: 1,
    created_at: 1,
    user_id: 'u1',
    user: { id: 'u1', display_name: 'Anna' },
    ...over,
  }) as WishOut;

export const other = (over: Partial<WishOut> = {}) =>
  wish({ id: 'w9', title: 'Emma', authors: 'Jane Austen', user_id: 'u2', user: { id: 'u2', display_name: 'Bruno' }, ...over });

export interface Server {
  role?: string;
  mine?: WishOut[];
  family?: WishOut[];
  /** Answers first; `undefined` falls through to the defaults. */
  extra?: (call: RecordedCall) => ReturnType<typeof ok> | { status: number; body: unknown } | undefined;
}

/** An in-memory server for the calls the wishlist makes. */
export function wishPlatform(s: Server = {}): FakePlatform {
  return fakePlatform({
    handler: (call: RecordedCall) => {
      const own = s.extra?.(call);
      if (own) return own;
      const url = new URL(call.path, 'http://x');
      const p = url.pathname;
      if (p === '/api/v1/me') return ok({ ...ME, user: { ...ME.user, role: s.role ?? 'owner' } });
      if (p === '/api/v1/wishlist' && call.method === 'GET') {
        const family = url.searchParams.get('scope') === 'family';
        return ok({ items: (family ? s.family : s.mine) ?? [] });
      }
      if (p === '/api/v1/wishlist' && call.method === 'POST') return ok(wish({ id: 'new', ...(call.body as object) }));
      if (p.startsWith('/api/v1/wishlist/') && call.method === 'PATCH') return ok(wish(call.body as object));
      if (p.endsWith('/convert')) return ok({ id: 'nb', title: 'Dune', authors: [], on_loan: false } as unknown as BookOut);
      if (p.startsWith('/api/v1/wishlist/') && call.method === 'DELETE') return { status: 204, body: undefined };
      if (p === '/api/v1/books/nb') return ok({ id: 'nb', title: 'Dune', authors: [], on_loan: false, created_at: 1, updated_at: 1 });
      return { status: 404, body: { error_code: 'not_found', message: 'x' } };
    },
  });
}

export function renderWishlist(platform: FakePlatform, route = '/wishlist') {
  pair(platform.storage);
  return renderMobile({ platform, modules: [module, search], route });
}

export const writes = (platform: FakePlatform) => platform.fake.calls.filter((c) => c.method !== 'GET');
