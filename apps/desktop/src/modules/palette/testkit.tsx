import type { BookOut } from '@bookeeper/api';
import type { IconName } from '@bookeeper/ui/base';
import { renderApp } from '../../app/testing';
import type { AppModule } from '../../app/types';
import { fakeConnection, fakePlatform } from '../../platform/testing';
import { ME, ok } from '../../session/fixtures';
import { module as palette } from './routes';

function page(id: string, to: string, icon: IconName, order: number, group: 'main' | 'bottom' = 'main'): AppModule {
  return {
    id,
    nav: { labelKey: `${id}.title`, icon, to, group, order },
    routes: [
      { path: to, element: <h1>{`page ${id}`}</h1> },
      { path: `${to}/:id`, element: <h1>{`detail ${id}`}</h1> },
    ],
  };
}

/** Stand-ins for the modules of the app, each a page with the real label and address. */
export const PAGES: AppModule[] = [
  page('books', '/books', 'book', 10),
  page('shelves', '/shelves', 'library', 20),
  page('loans', '/loans', 'loans', 30),
  page('wishlist', '/wishlist', 'heart', 40),
  page('stats', '/stats', 'chart', 50),
  page('devices', '/devices', 'phone', 10, 'bottom'),
  page('settings', '/settings', 'settings', 20, 'bottom'),
];

export function book(i: number, over: Partial<BookOut> = {}): BookOut {
  return { id: `b${i}`, title: `Libro ${i}`, authors: [`Autore ${i}`], on_loan: false, tags: [], reading: null, file_formats: [], created_at: 0, updated_at: 0, ...over };
}

export interface World {
  books?: BookOut[];
  role?: 'owner' | 'member' | 'guest';
  modules?: AppModule[];
}

export function renderPalette(world: World = {}, route = '/books') {
  const rows = world.books ?? [];
  const platform = fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: (r) => {
      const url = new URL(r.path, 'http://x');
      if (url.pathname === '/api/v1/me') return ok({ ...ME, user: { ...ME.user, role: world.role ?? 'owner' } });
      if (url.pathname === '/api/v1/books') {
        const q = (url.searchParams.get('q') ?? '').toLowerCase();
        const items = rows.filter((b) => b.title.toLowerCase().includes(q));
        return ok({ items, total: items.length });
      }
      if (url.pathname === '/api/v1/shelves') return ok({ items: [{ id: 's1', name: 'Libreria del salotto' }] });
      if (url.pathname === '/api/v1/auth/logout') return { status: 204, body: undefined };
      return { status: 404, body: { error_code: 'not_found', message: 'x' } };
    },
  });
  const view = renderApp({ platform, modules: [...(world.modules ?? PAGES), palette], route });
  return { ...view, platform };
}

/** Requests for the catalogue that carried a search text. */
export function searches(platform: ReturnType<typeof fakePlatform>): string[] {
  return platform.calls
    .filter((c) => c.path.startsWith('/api/v1/books?'))
    .map((c) => new URL(c.path, 'http://x').searchParams.get('q') ?? '');
}
