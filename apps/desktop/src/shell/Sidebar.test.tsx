import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderApp } from '../app/testing';
import type { AppModule } from '../app/types';
import { fakeConnection, fakePlatform } from '../platform/testing';
import { ME, ok } from '../session/fixtures';
import { firstBook } from '../modules/tour';
import { resetTourForTest, useTourStore } from '../modules/tour/store';

const page = (id: string, group: 'main' | 'bottom', title: string): AppModule => ({
  id,
  nav: { labelKey: `${id}.title`, icon: 'book', to: `/${id}`, group, order: 10 },
  routes: [{ path: `/${id}`, element: <h1>{title}</h1> }],
});
const modules = [page('books', 'main', 'Pagina libri'), page('shelves', 'main', 'Pagina scaffali'), page('devices', 'bottom', 'Pagina dispositivi')];

function show() {
  const platform = fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: (r) => (r.path === '/api/v1/me' ? ok(ME) : { status: 204, body: null }),
  });
  renderApp({ platform, modules, route: '/books' });
}

beforeEach(() => {
  resetTourForTest();
  localStorage.clear();
});

describe('sidebar and the tour', () => {
  it('puts an anchor on every entry and on the search', async () => {
    show();
    await screen.findByRole('heading', { name: 'Pagina libri' });
    for (const id of ['books', 'shelves', 'devices']) {
      expect(document.querySelector(`nav [data-tour="nav.${id}"]`)).toHaveAttribute('href', `/${id}`);
    }
    expect(screen.getByRole('button', { name: /Cerca/ })).toHaveAttribute('data-tour', 'nav.search');
  });

  it('shows «Primi passi» only while the tour is paused, and picking it up resumes', async () => {
    show();
    await screen.findByRole('heading', { name: 'Pagina libri' });
    expect(screen.queryByRole('button', { name: /^Primi passi/ })).not.toBeInTheDocument();
    act(() => useTourStore.getState().start(firstBook));
    act(() => useTourStore.getState().pause());
    await userEvent.click(await screen.findByRole('button', { name: /^Primi passi/ }));
    expect(useTourStore.getState().status).toBe('running');
    expect(screen.queryByRole('button', { name: /^Primi passi/ })).not.toBeInTheDocument();
  });
});
