import type { Stats } from '@bookeeper/api';
import { renderApp } from '../../app/testing';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../platform/testing';
import { ME, ok } from '../../session/fixtures';
import { module } from './routes';
import type { AppModule } from '../../app';

export const OVERVIEW: Stats['overview'] = {
  total_books: 42,
  total_authors: 30,
  total_shelves: 3,
  total_pages: 12345,
  wishlist_count: 5,
  active_loans: 2,
  overdue_loans: 1,
  returned_loans: 7,
};

export function stats(over: Partial<Stats> = {}): Stats {
  return {
    overview: OVERVIEW,
    by_format: [],
    by_language: [],
    by_genre: [],
    by_decade: [],
    additions_by_month: [],
    loans_by_month: [],
    top_authors: [],
    shelf_fill: [],
    ...over,
  };
}

export interface Backend {
  stats: Stats;
  fails?: boolean;
  /** The stats request never answers. */
  pending?: boolean;
}

export function statsPlatform(b: Backend): FakePlatform {
  return fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: async (r) => {
      const p = r.path.split('?')[0]!;
      if (p === '/api/v1/me') return ok(ME);
      if (p === '/api/v1/stats') {
        if (b.pending) await new Promise(() => {});
        return b.fails ? { status: 500, body: { error_code: 'internal', message: 'x' } } : ok(b.stats);
      }
      return { status: 404, body: { error_code: 'not_found', message: 'x' } };
    },
  });
}

/** Reduced motion on, so counters show their final value at once. */
export function reduceMotion(): void {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as typeof window.matchMedia;
}

const stubs: AppModule[] = [
  { id: 'books', routes: [{ path: '/books', element: <p>Elenco libri</p> }] },
  { id: 'shelves', routes: [{ path: '/shelves', element: <p>Scaffali</p> }] },
];

export function renderStats(b: Backend, locale: 'it' | 'en' = 'it') {
  const platform = statsPlatform(b);
  return { ...renderApp({ platform, modules: [module, ...stubs], route: '/stats', locale }), platform };
}
