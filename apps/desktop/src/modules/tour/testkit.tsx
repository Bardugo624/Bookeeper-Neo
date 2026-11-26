import { useState } from 'react';
import { act } from '@testing-library/react';
import { vi } from 'vitest';
import { Dialog } from '@bookeeper/ui/overlays';
import { renderApp } from '../../app/testing';
import type { AppModule } from '../../app/types';
import { fakeConnection, fakePlatform } from '../../platform/testing';
import { ME, ok } from '../../session/fixtures';
import type { TourPath } from './model';
import { module as tour } from './routes';
import { resetTourForTest } from './store';
import { tourAnchor } from './store';

export const PATH: TourPath = {
  id: 'test',
  steps: [
    { id: 'one', titleKey: 'tour.pill.label', textKey: 'tour.card.step', params: { n: 1, total: 3 }, target: 'one', signal: 'one-done' },
    { id: 'two', titleKey: 'tour.pill.label', textKey: 'tour.card.step', params: { n: 2, total: 3 }, target: ({ has }) => (has('two-b') ? 'two-b' : 'two-a'), signal: 'two-done', accept: (d) => d === 'ok' },
    { id: 'three', titleKey: 'tour.dismiss', textKey: 'tour.card.step', params: { n: 3, total: 3 }, target: 'three', signal: 'three-done' },
  ],
};

export const clicks = vi.fn();

function Page() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <h1>Pagina</h1>
      <button {...tourAnchor('one')} onClick={clicks}>
        uno
      </button>
      <button {...tourAnchor('two-a')}>due</button>
      <button {...tourAnchor('three')} onClick={() => setOpen(true)}>
        tre
      </button>
      <button>altrove</button>
      <Dialog open={open} onOpenChange={setOpen} title="Finestra" closeLabel="Chiudi">
        <button {...tourAnchor('in-dialog')}>dentro</button>
      </Dialog>
    </div>
  );
}

export const page: AppModule = {
  id: 'books',
  nav: { labelKey: 'books.title', icon: 'book', to: '/books', group: 'main', order: 10 },
  routes: [{ path: '/books', element: <Page /> }],
};

/** jsdom has no layout: every anchor gets a box, and `matchMedia` / `ResizeObserver` exist. */
export function installBrowser({ reduced = false }: { reduced?: boolean } = {}) {
  vi.stubGlobal(
    'matchMedia',
    (q: string) => ({ matches: reduced && q.includes('reduce'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const id = this.getAttribute('data-tour');
    const base = { x: 100, y: 100, width: 80, height: 32, top: 100, left: 100, right: 180, bottom: 132, toJSON: () => ({}) };
    if (id === 'two-a') return { ...base, x: 300, left: 300, right: 380 } as DOMRect;
    if (id === 'two-b') return { ...base, x: 500, left: 500, right: 580 } as DOMRect;
    if (id || this.getAttribute('role') === 'dialog') return base as DOMRect;
    return { ...base, width: 0, height: 0 } as DOMRect;
  });
}

export function renderTour(connectionId = 'c1') {
  resetTourForTest();
  const platform = fakePlatform({
    connections: { active: connectionId, items: [fakeConnection({ id: connectionId })] },
    handler: (r) => (new URL(r.path, 'http://x').pathname === '/api/v1/me' ? ok(ME) : { status: 404, body: { error_code: 'not_found', message: 'x' } }),
  });
  return renderApp({ platform, modules: [page, tour], route: '/books' });
}

export const flush = () => act(async () => {});
