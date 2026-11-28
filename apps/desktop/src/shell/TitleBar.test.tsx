import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../app/testing';
import type { AppModule } from '../app/types';
import { fakeConnection, fakePlatform } from '../platform/testing';
import { ME, ok } from '../session/fixtures';

const modules: AppModule[] = [
  { id: 'books', nav: { labelKey: 'books.title', icon: 'book', to: '/books', group: 'main', order: 10 }, routes: [{ path: '/books', element: <h1>Libri</h1> }] },
];

function show(window: boolean) {
  const platform = fakePlatform({
    window,
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: (r) => (r.path === '/api/v1/me' ? ok(ME) : { status: 204, body: null }),
  });
  renderApp({ platform, modules, route: '/books' });
  return platform;
}

describe('the window controls of the title bar', () => {
  it('the_top_bar_has_the_window_controls', async () => {
    const platform = show(true);
    await screen.findByRole('heading', { name: 'Libri' });
    await userEvent.click(screen.getByRole('button', { name: 'Riduci a icona' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ingrandisci' }));
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(platform.windowCalls).toEqual(['minimize', 'toggleMaximize', 'close']);
  });

  it('draws none without a native window', async () => {
    show(false);
    await screen.findByRole('heading', { name: 'Libri' });
    expect(screen.queryByRole('button', { name: 'Chiudi' })).toBeNull();
  });
});
