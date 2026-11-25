import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '../../../../app/AppProviders';
import { buildRoutes } from '../../../../app/routes';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../../../platform/testing';
import type { UpdateState } from '../../../../platform';
import { useSession } from '../../../../session';
import { ME, ok } from '../../../../session/fixtures';
import { controllerFor } from '../../../updates/controller';
import { module } from '../../routes';
import { setSystemLanguage } from '../../testkit';

function renderSettings(state: UpdateState | null, route = '/settings/updates'): FakePlatform {
  const platform = fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    ...(state ? { updates: { state } } : {}),
    handler: (r) => (r.path.split('?')[0] === '/api/v1/me' ? ok(ME) : { status: 404, body: { error_code: 'not_found', message: 'x' } }),
  });
  setSystemLanguage('it-IT');
  useSession.setState({ status: 'loading', connection: null, me: null, platform: null });
  const router = createMemoryRouter(buildRoutes([module]), { initialEntries: [route] });
  render(
    <AppProviders platform={platform}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return platform;
}

beforeEach(() => localStorage.clear());

const available: UpdateState = { state: 'available', version: '2.1.0', notes: 'n', date: null };

describe('visibility', () => {
  it('is absent when updates are off', async () => {
    const platform = fakePlatform({ updates: { state: { state: 'disabled' } } });
    await controllerFor(platform.updates!).check();
    useSession.setState({ status: 'loading', connection: null, me: null, platform: null });
    const router = createMemoryRouter(buildRoutes([module]), { initialEntries: ['/settings'] });
    setSystemLanguage('it-IT');
    platform.state = { active: 'c1', items: [fakeConnection()] };
    platform.handle((r) => (r.path.split('?')[0] === '/api/v1/me' ? ok(ME) : { status: 404, body: { error_code: 'not_found', message: 'x' } }));
    render(
      <AppProviders platform={platform}>
        <RouterProvider router={router} />
      </AppProviders>,
    );
    await screen.findByRole('link', { name: 'Account' });
    expect(screen.queryByRole('link', { name: 'Aggiornamenti' })).toBeNull();
  });

  it('is absent where the platform cannot update', async () => {
    renderSettings(null, '/settings');
    await screen.findByRole('link', { name: 'Account' });
    expect(screen.queryByRole('link', { name: 'Aggiornamenti' })).toBeNull();
  });

  it('is listed when updates work', async () => {
    renderSettings({ state: 'up_to_date' }, '/settings');
    expect(await screen.findByRole('link', { name: 'Aggiornamenti' })).toBeTruthy();
  });
});

describe('page', () => {
  it('shows the status and checks again on request', async () => {
    const platform = renderSettings({ state: 'up_to_date' });
    expect(await screen.findByText('Bookeeper è aggiornato.')).toBeTruthy();
    expect(screen.getByText('Versione installata')).toBeTruthy();
    const before = platform.updatesFake.checks.length;
    await userEvent.click(screen.getByRole('button', { name: 'Cerca aggiornamenti' }));
    await waitFor(() => expect(platform.updatesFake.checks.length).toBe(before + 1));
  });

  it('offers the notes of an available version', async () => {
    renderSettings(available);
    expect(await screen.findByText('È disponibile la versione 2.1.0.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vedi le novità' })).toBeTruthy();
  });

  it('changing the channel warns about beta and checks again', async () => {
    const platform = renderSettings({ state: 'up_to_date' });
    await screen.findByText('Bookeeper è aggiornato.');
    expect(screen.queryByRole('note')).toBeNull();
    const before = platform.updatesFake.checks.length;
    await userEvent.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(await screen.findByRole('note')).toBeTruthy();
    await waitFor(() => expect(platform.updatesFake.checks.length).toBe(before + 1));
    expect(platform.updatesFake.checks.at(-1)).toBe('beta');
    expect(localStorage.getItem('bookeeper.update.channel')).toBe('beta');
  });
});
