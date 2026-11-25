import type { BookOut, WishOut } from '@bookeeper/api';
import { useQuery } from '@tanstack/react-query';
import { renderApp } from '../../app/testing';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../platform/testing';
import { ME, ok } from '../../session/fixtures';
import type { AppModule } from '../../app';
import { useClient, useSession } from '../../session';
import { module } from './routes';
import { WishlistPage } from './WishlistPage';

export function wish(i: number, over: Partial<WishOut> = {}): WishOut {
  return { id: `w${i}`, user_id: 'u1', title: `Desiderio ${i}`, priority: 1, created_at: 1_700_000_000 + i * 86_400, ...over };
}

export interface Shop {
  items: WishOut[];
  role?: 'owner' | 'member' | 'guest';
  /** Status to answer a convert with instead of success. */
  convertFails?: number;
  /** Status to answer a delete with instead of success. */
  deleteFails?: number;
  /** The list request fails. */
  listFails?: boolean;
}

const BOOK: BookOut = { id: 'b9', title: 'Nuovo libro', authors: [], on_loan: false, created_at: 0, updated_at: 0 };

/** Answers `/me` and the wishlist routes from an in-memory list. */
export function wishPlatform(shop: Shop): FakePlatform {
  const me = { ...ME, user: { ...ME.user, role: shop.role ?? 'owner' } };
  return fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: (r) => {
      const p = r.path.split('?')[0]!;
      if (p === '/api/v1/me') return ok(me);
      if (p === '/api/v1/books') return ok({ items: [], total: 0 });
      if (p === '/api/v1/shelves') return ok({ items: [] });
      if (p === '/api/v1/wishlist' && r.method === 'GET') {
        return shop.listFails ? { status: 500, body: { error_code: 'internal', message: 'x' } } : ok({ items: shop.items });
      }
      if (p === '/api/v1/wishlist' && r.method === 'POST') {
        const created = wish(99, { ...(r.body as object), id: 'w99' } as Partial<WishOut>);
        shop.items = [...shop.items, created];
        return { status: 201, body: created };
      }
      const m = /^\/api\/v1\/wishlist\/([^/]+)(\/convert)?$/.exec(p);
      if (!m) return { status: 404, body: { error_code: 'not_found', message: 'x' } };
      const found = shop.items.find((w) => w.id === m[1]);
      if (!found) return { status: 404, body: { error_code: 'not_found', message: 'x' } };
      if (m[2]) {
        if (shop.convertFails) return { status: shop.convertFails, body: { error_code: 'validation', message: 'x' } };
        shop.items = shop.items.filter((w) => w !== found);
        return { status: 201, body: { ...BOOK, title: found.title } };
      }
      if (r.method === 'PATCH') {
        const next = { ...found, ...(r.body as object) } as WishOut;
        shop.items = shop.items.map((w) => (w === found ? next : w));
        return ok(next);
      }
      if (r.method === 'DELETE') {
        if (shop.deleteFails) return { status: shop.deleteFails, body: { error_code: 'internal', message: 'x' } };
        shop.items = shop.items.filter((w) => w !== found);
        return { status: 204, body: undefined };
      }
      return { status: 404, body: { error_code: 'not_found', message: 'x' } };
    },
  });
}

export function renderWishlist(shop: Shop, route = '/wishlist', locale: 'it' | 'en' = 'it') {
  const platform = wishPlatform(shop);
  return { ...renderApp({ platform, modules: [module], route, locale }), platform };
}

/** Keeps a books query and a stats query mounted next to the wishlist, to see them refetch. */
function Probe() {
  const client = useClient();
  const id = useSession((s) => s.connection?.id);
  useQuery({ queryKey: ['books', id, 'probe'], queryFn: () => client.listBooks({ limit: 1 }) });
  useQuery({ queryKey: ['stats', id, 'probe'], queryFn: () => client.listShelves() });
  return null;
}

export function renderWithProbe(shop: Shop) {
  const platform = wishPlatform(shop);
  const probed: AppModule = {
    id: 'probe',
    routes: [{ path: '/wishlist', element: (<><WishlistPage /><Probe /></>) }],
  };
  return { ...renderApp({ platform, modules: [probed, booksStub], route: '/wishlist' }), platform };
}

const booksStub: AppModule = { id: 'books', routes: [{ path: '/books/:id', element: <p>Scheda libro</p> }] };
