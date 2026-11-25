import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from '@bookeeper/ui/overlays';
import { fakeConnection, fakePlatform, type FakePlatform } from '../platform/testing';
import { ME, ok } from '../session/fixtures';
import { THEME_KEY } from '../theme';
import { resetThemeForTest } from '../theme/useTheme';
import { renderApp } from './testing';
import type { AppModule } from './types';

const books: AppModule = {
  id: 'books',
  nav: { labelKey: 'books.nav', icon: 'book', to: '/books', group: 'main', order: 1 },
  routes: [{ path: '/books', element: <h1>Libri qui</h1> }],
};
const settings: AppModule = {
  id: 'settings',
  nav: { labelKey: 'settings.nav', icon: 'settings', to: '/settings', group: 'bottom', order: 1 },
  routes: [{ path: '/settings', element: <h1>Impostazioni qui</h1> }],
};

function signedIn(opts: Parameters<typeof fakePlatform>[0] = {}): FakePlatform {
  return fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: (r) => (r.path === '/api/v1/me' ? ok(ME) : { status: 204, body: null }),
    ...opts,
  });
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  resetThemeForTest();
});

describe('providers', () => {
  it('mounts a single TooltipProvider', async () => {
    const tip: AppModule = {
      id: 'tip',
      routes: [{ path: '/tip', element: <Tooltip content="Aiuto"><button type="button">Con suggerimento</button></Tooltip> }],
    };
    renderApp({ platform: signedIn(), modules: [tip], route: '/tip' });
    // A Tooltip throws without a provider above it.
    await screen.findByRole('button', { name: 'Con suggerimento' });
    // ...and the app mounts exactly one.
    const src = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const mounts = Object.entries(src).filter(([f, s]) => !f.endsWith('.test.tsx') && s.includes('<TooltipProvider>'));
    expect(mounts.map(([f]) => f)).toEqual(['./AppProviders.tsx']);
  });
});

describe('router', () => {
  it('sends a protected route to /welcome while signed out', async () => {
    const { router } = renderApp({ modules: [books], route: '/books' });
    await screen.findByText('Preparazione del primo avvio.');
    expect(router.state.location.pathname).toBe('/welcome');
  });

  it('sends /welcome to the first nav item once ready', async () => {
    const { router } = renderApp({ platform: signedIn(), modules: [settings, books], route: '/welcome' });
    expect(await screen.findByRole('heading', { name: 'Libri qui' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/books');
  });

  it('shows a module nav entry and mounts its route', async () => {
    renderApp({ platform: signedIn(), modules: [books], route: '/books' });
    expect(await screen.findByRole('link', { name: 'books.nav' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Libri qui' })).toBeInTheDocument();
  });

  it('shows an EmptyState when there are no modules', async () => {
    renderApp({ platform: signedIn() });
    expect(await screen.findByRole('heading', { name: "Non c'è ancora nulla qui" })).toBeInTheDocument();
  });

  it('mounts public routes from modules outside the shell', async () => {
    const mod: AppModule = { id: 'w', routes: [], public: [{ path: '/welcome', element: <p>Benvenuto</p> }] };
    renderApp({ modules: [mod], route: '/books' });
    expect(await screen.findByText('Benvenuto')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('catches a route error and retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // React logs the expected throw
    let fail = true;
    function Boom() {
      if (fail) throw new Error('boom');
      return <p>Recuperato</p>;
    }
    const mod: AppModule = { id: 'b', routes: [{ path: '/boom', element: <Boom /> }] };
    renderApp({ platform: signedIn(), modules: [mod], route: '/boom' });
    expect(await screen.findByRole('heading', { name: 'Qualcosa non ha funzionato' })).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('Recuperato')).toBeInTheDocument();
  });
});

describe('shell', () => {
  it('marks the active item with aria-current', async () => {
    renderApp({ platform: signedIn(), modules: [books, settings], route: '/settings' });
    const active = await screen.findByRole('link', { name: 'settings.nav' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'books.nav' })).not.toHaveAttribute('aria-current');
  });

  it('window controls call the platform', async () => {
    const p = signedIn();
    renderApp({ platform: p, modules: [books], route: '/books' });
    await userEvent.click(await screen.findByRole('button', { name: 'Riduci a icona' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ingrandisci' }));
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(p.windowCalls).toEqual(['minimize', 'toggleMaximize', 'close']);
  });

  it('the maximize button turns into restore while maximized', async () => {
    const p = signedIn();
    renderApp({ platform: p, modules: [books], route: '/books' });
    await screen.findByRole('button', { name: 'Ingrandisci' });
    p.setMaximized(true);
    expect(await screen.findByRole('button', { name: 'Ripristina' })).toBeInTheDocument();
  });

  it('has no window controls without a native window', async () => {
    renderApp({ platform: signedIn({ window: false }), modules: [books], route: '/books' });
    await screen.findByRole('heading', { name: 'Libri qui' });
    expect(screen.queryByRole('button', { name: 'Chiudi' })).not.toBeInTheDocument();
  });

  it('library menu shows name and role, and Esci signs out', async () => {
    const p = signedIn();
    renderApp({ platform: p, modules: [books], route: '/books' });
    const badge = await screen.findByRole('button', { name: /Casa Rossi/ });
    expect(badge).toHaveTextContent('Anna · Proprietario');
    await userEvent.click(badge);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Esci' }));
    await waitFor(() => expect(p.calls.some((c) => c.path === '/api/v1/auth/logout')).toBe(true));
    await screen.findByText('Preparazione del primo avvio.');
    expect(p.state.items[0]).toMatchObject({ access_token: null });
  });

  it('the theme menu saves the choice and toggles the dark class', async () => {
    renderApp({ platform: signedIn(), modules: [books], route: '/books' });
    await userEvent.click(await screen.findByRole('button', { name: /Casa Rossi/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Tema scuro' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    await userEvent.click(await screen.findByRole('button', { name: /Casa Rossi/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Tema chiaro' }));
    expect(document.documentElement).not.toHaveClass('dark');
  });
});
