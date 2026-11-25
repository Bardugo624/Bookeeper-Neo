import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { MobileModule } from '../app/types';
import { renderMobile } from '../app/testing';
import { fakePlatform } from '../platform/testing';
import { ME, ok, pair } from '../session/fixtures';

const tab = (id: string, order: number, icon: 'search' | 'grid' | 'settings'): MobileModule => ({
  id,
  routes: [{ path: `/${id}`, element: <p>vista {id}</p> }],
  tab: { labelKey: `test.${id}`, icon, to: `/${id}`, order },
});

function paired(opts: { online?: boolean } = {}) {
  const platform = fakePlatform({ handler: () => ok(ME), ...opts });
  pair(platform.storage);
  return platform;
}

describe('tab bar', () => {
  // Labels are looked up as `mobile.<id>`; unknown keys render as the key, which is what we match.
  const modules = [tab('account', 30, 'settings'), tab('search', 10, 'search'), tab('scan', 20, 'grid')];

  it('lists the tabs of the modules in order', async () => {
    renderMobile({ platform: paired(), modules, route: '/search' });
    const nav = await screen.findByRole('navigation', { name: 'Schede principali' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'test.search',
      'test.scan',
      'test.account',
    ]);
  });

  it('marks the active tab with aria-current and follows taps', async () => {
    renderMobile({ platform: paired(), modules, route: '/search' });
    const nav = await screen.findByRole('navigation', { name: 'Schede principali' });
    expect(within(nav).getByRole('link', { name: 'test.search' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'test.scan' })).not.toHaveAttribute('aria-current');
    await userEvent.setup().click(within(nav).getByRole('link', { name: 'test.scan' }));
    expect(await screen.findByText('vista scan')).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'test.scan' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps a tab active on the other paths it owns', async () => {
    const search: MobileModule = {
      id: 'search',
      routes: [{ path: '/books/:id', element: <p>dettaglio</p> }],
      tab: { labelKey: 'test.search', icon: 'search', to: '/search', order: 1, also: ['/books'] },
    };
    renderMobile({ platform: paired(), modules: [search], route: '/books/b1' });
    await screen.findByText('dettaglio');
    expect(screen.getByRole('link', { name: 'test.search' })).toHaveAttribute('aria-current', 'page');
  });

  it('opens the first tab from the root', async () => {
    const { router } = renderMobile({ platform: paired(), modules });
    await screen.findByText('vista search');
    expect(router.state.location.pathname).toBe('/search');
  });
});

describe('update banner', () => {
  it('appears when a new version is ready and reloads only after the tap', async () => {
    const platform = paired();
    renderMobile({ platform, modules: [tab('search', 10, 'search')] });
    await screen.findByText('vista search');
    expect(screen.queryByText('È disponibile una nuova versione')).toBeNull();
    act(() => platform.serviceWorker.emitUpdate());
    expect(screen.getByText('È disponibile una nuova versione')).toBeInTheDocument();
    expect(platform.serviceWorker.applyUpdate).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Aggiorna' }));
    expect(platform.serviceWorker.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('registers the service worker once the app starts', () => {
    const platform = paired();
    renderMobile({ platform });
    expect(platform.serviceWorker.register).toHaveBeenCalled();
  });
});

describe('offline strip', () => {
  it('shows and hides with the network state', async () => {
    const platform = paired({ online: false });
    renderMobile({ platform, modules: [tab('search', 10, 'search')] });
    expect(await screen.findByText('Sei offline')).toBeInTheDocument();
    act(() => platform.network.set(true));
    expect(screen.queryByText('Sei offline')).toBeNull();
    act(() => platform.network.set(false));
    expect(screen.getByText('Sei offline')).toBeInTheDocument();
  });
});

describe('empty shell', () => {
  it('shows an empty state without modules', async () => {
    renderMobile({ platform: paired() });
    expect(await screen.findByText('Niente da mostrare')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
