import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakePlatform } from '../platform/testing';
import { ME, ok, pair } from '../session/fixtures';
import { collectModules } from './modules';
import { renderMobile } from './testing';
import type { MobileModule } from './types';

describe('secure context gate', () => {
  it('shows only the dedicated page and makes no request', async () => {
    const platform = fakePlatform({ secure: false });
    pair(platform.storage);
    renderMobile({ platform });
    expect(screen.getByRole('heading', { name: 'Serve un indirizzo sicuro' })).toBeInTheDocument();
    expect(screen.getByText(/Per usare Bookeeper dal telefono serve un indirizzo sicuro/)).toBeInTheDocument();
    expect(platform.fake.calls).toHaveLength(0);
    expect(platform.serviceWorker.register).not.toHaveBeenCalled();
  });

  it('speaks English when asked', () => {
    renderMobile({ platform: fakePlatform({ secure: false }), locale: 'en' });
    expect(screen.getByRole('heading', { name: 'A secure address is needed' })).toBeInTheDocument();
  });
});

describe('modules', () => {
  const pairing: MobileModule = { id: 'pair', routes: [], public: [{ path: '/pair', element: <p>Abbina</p> }] };

  it('uses the pairing page of a module when there is one', async () => {
    renderMobile({ modules: [pairing] });
    expect(await screen.findByText('Abbina')).toBeInTheDocument();
  });

  it('sends a paired phone from a public page to the first tab', async () => {
    const platform = fakePlatform({ handler: () => ok(ME) });
    pair(platform.storage);
    const search: MobileModule = {
      id: 'search',
      routes: [{ path: '/search', element: <p>Cerca qui</p> }],
      tab: { labelKey: 'test.search', icon: 'search', to: '/search', order: 10 },
    };
    const { router } = renderMobile({ platform, modules: [pairing, search], route: '/pair' });
    expect(await screen.findByText('Cerca qui')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/search');
  });

  it('collects the module of each routes file', () => {
    const m = { id: 'x', routes: [] };
    expect(collectModules({ '../modules/b/routes.tsx': { module: m }, '../modules/a/routes.tsx': {} })).toEqual([m]);
  });
});
