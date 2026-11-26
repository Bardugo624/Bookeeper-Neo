import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '../../../../app/AppProviders';
import { buildRoutes } from '../../../../app/routes';
import { OVERDUE_ALERTS_KEY, readOverdueAlerts } from '../../../../kit/overdueAlerts';
import { fakeConnection, fakePlatform, type FakePlatform, type FakePlatformOptions } from '../../../../platform/testing';
import { useSession } from '../../../../session';
import { ME, ok } from '../../../../session/fixtures';
import { module } from '../../routes';
import { setSystemLanguage } from '../../testkit';

function renderSettings(notifications: FakePlatformOptions['notifications'], route = '/settings/notifications'): FakePlatform {
  const platform = fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    ...(notifications ? { notifications } : {}),
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

beforeEach(() => {
  localStorage.clear();
});

describe('notifications section', () => {
  it('is absent where the platform has no notifications', async () => {
    renderSettings(undefined, '/settings');
    await screen.findByRole('link', { name: 'Account' });
    expect(screen.queryByRole('link', { name: 'Notifiche' })).toBeNull();
  });

  it('is listed where it has them', async () => {
    renderSettings({ permission: 'granted' }, '/settings');
    expect(await screen.findByRole('link', { name: 'Notifiche' })).toBeTruthy();
  });

  it('turns the preference off and on and saves it', async () => {
    const user = userEvent.setup();
    renderSettings({ permission: 'granted' });
    const toggle = await screen.findByRole('switch', { name: 'Avvisami dei prestiti scaduti' });
    await user.click(toggle);
    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(localStorage.getItem(OVERDUE_ALERTS_KEY)).toBe('off');
    await user.click(toggle);
    expect((toggle as HTMLInputElement).checked).toBe(true);
    expect(readOverdueAlerts()).toBe(true);
  });

  it('asks for the permission when turning on with `prompt`', async () => {
    const user = userEvent.setup();
    const platform = renderSettings({ permission: 'prompt', answer: 'granted' });
    const toggle = await screen.findByRole('switch', { name: 'Avvisami dei prestiti scaduti' });
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle); // off
    await user.click(toggle); // on again
    await waitFor(() => expect(platform.notificationsFake.requests).toBe(1));
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('does not ask when the permission is already granted', async () => {
    const user = userEvent.setup();
    const platform = renderSettings({ permission: 'granted' });
    const toggle = await screen.findByRole('switch', { name: 'Avvisami dei prestiti scaduti' });
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);
    await user.click(toggle);
    expect(platform.notificationsFake.requests).toBe(0);
  });

  it('says where to re-enable them when the system said no', async () => {
    renderSettings({ permission: 'denied' });
    expect(await screen.findByRole('note')).toHaveTextContent(/impostazioni di sistema/);
  });

  it('shows the sentence after a refused request', async () => {
    const user = userEvent.setup();
    renderSettings({ permission: 'prompt', answer: 'denied' });
    const toggle = await screen.findByRole('switch', { name: 'Avvisami dei prestiti scaduti' });
    await user.click(toggle);
    await user.click(toggle);
    expect(await screen.findByRole('note')).toHaveTextContent(/impostazioni di sistema/);
  });
});
