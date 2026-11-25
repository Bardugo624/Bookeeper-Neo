import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetLocalePreferenceForTest } from '../../../../app/i18n';
import { AppProviders } from '../../../../app/AppProviders';
import { buildRoutes } from '../../../../app/routes';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../../../platform/testing';
import { useSession } from '../../../../session';
import { ME, ok } from '../../../../session/fixtures';
import { module } from '../../routes';
import { setSystemLanguage } from '../../testkit';
import { collectSections } from '../../sections';
import { parsePort } from './sharingModel';

beforeEach(() => {
  localStorage.clear();
  resetLocalePreferenceForTest();
});

interface World {
  role?: 'owner' | 'admin' | 'member';
  email?: string | null;
  kind?: 'local' | 'remote';
  sharing?: boolean;
  status?: Parameters<typeof fakePlatform>[0] extends infer O ? (O extends { sharingStatus?: infer S } ? S : never) : never;
}

function renderSharing(world: World = {}) {
  const me = { ...ME, user: { ...ME.user, role: world.role ?? 'owner', email: world.email === undefined ? 'anna@example.org' : world.email } };
  const platform: FakePlatform = fakePlatform({
    connections: { active: 'c1', items: [fakeConnection({ kind: world.kind ?? 'local' })] },
    sharing: world.sharing,
    sharingStatus: world.status,
    handler: (r) => (r.path.split('?')[0] === '/api/v1/me' ? ok(me) : { status: 404, body: { error_code: 'not_found', message: 'x' } }),
  });
  setSystemLanguage('it-IT');
  useSession.setState({ status: 'loading', connection: null, me: null, platform: null });
  const router = createMemoryRouter(buildRoutes([module]), { initialEntries: ['/settings/sharing'] });
  render(
    <AppProviders platform={platform}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { platform, router };
}

const toggle = () => screen.findByRole('switch', { name: 'Condividi questa libreria in rete' });

describe('visibility', () => {
  const listed = async (world: World) => {
    renderSharing(world);
    await screen.findByRole('link', { name: 'Account' });
    return screen.queryByRole('link', { name: 'Condivisione' }) !== null;
  };

  it('is there for the owner of a local library on the desktop app', async () => {
    expect(await listed({})).toBe(true);
  });
  it('is absent in the browser', async () => {
    expect(await listed({ sharing: false })).toBe(false);
  });
  it('is absent on a remote connection', async () => {
    expect(await listed({ kind: 'remote' })).toBe(false);
  });
  it('is absent for a non-owner', async () => {
    expect(await listed({ role: 'admin' })).toBe(false);
  });
});

describe('password', () => {
  it('shows the notice and never calls set when the owner has no password', async () => {
    const { platform } = renderSharing({ email: null });
    expect(await screen.findByText('Prima imposta una password')).toBeTruthy();
    expect(((await toggle()) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('link', { name: 'Vai ad Account' }).getAttribute('href')).toBe('/settings/account');
    expect(platform.sharingCalls).toHaveLength(0);
  });

  it('shows the notice when the shell answers password_required', async () => {
    const { platform } = renderSharing();
    platform.setSharingHandler((_e, _p, cur) => ({ ...cur, enabled: false, running: false, error: 'password_required' }));
    await userEvent.click(await toggle());
    expect(await screen.findByText('Prima imposta una password')).toBeTruthy();
  });
});

describe('turning on', () => {
  it('shows addresses, phrase and fingerprint, and copies', async () => {
    const { platform } = renderSharing();
    const user = userEvent.setup();
    await user.click(await toggle());
    expect(await screen.findByText('https://192.168.1.20:7842')).toBeTruthy();
    expect(platform.sharingCalls).toEqual([{ enabled: true, port: 7842 }]);
    expect(screen.getByLabelText(/Frase di verifica: uno due tre/)).toBeTruthy();
    expect(screen.getByText('AA:BB:CC:DD')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Copia l\'indirizzo https://192.168.1.20:7842' }));
    expect(await navigator.clipboard.readText()).toBe('https://192.168.1.20:7842');
  });

  it('proposes another port on port_in_use', async () => {
    const { platform } = renderSharing();
    platform.setSharingHandler((_e, p, cur) => ({ ...cur, port: p ?? cur.port, enabled: false, running: false, error: 'port_in_use' }));
    await userEvent.click(await toggle());
    expect(await screen.findByText(/La porta 7842 è già usata/)).toBeTruthy();
    expect((screen.getByLabelText('Numero di porta') as HTMLInputElement).disabled).toBe(false);
  });

  it('warns without blocking on mdns', async () => {
    const { platform } = renderSharing();
    platform.setSharingHandler((_e, p, cur) => ({ ...cur, enabled: true, running: true, port: p ?? cur.port, addresses: ['https://10.0.0.2:7842'], fingerprint: 'AA', phrase: 'a b c d e f', error: 'mdns' }));
    await userEvent.click(await toggle());
    expect(await screen.findByText(/scrivi l'indirizzo a mano/)).toBeTruthy();
    expect(screen.getByText('https://10.0.0.2:7842')).toBeTruthy();
  });
});

describe('port', () => {
  it('is locked while sharing is on', async () => {
    renderSharing({ status: { enabled: true, running: true, addresses: ['https://10.0.0.2:7842'], phrase: 'a b c d e f', fingerprint: 'AA' } });
    await screen.findByText('https://10.0.0.2:7842');
    expect((screen.getByLabelText('Numero di porta') as HTMLInputElement).disabled).toBe(true);
  });

  it('validates the range before calling set', async () => {
    const { platform } = renderSharing();
    const port = await screen.findByLabelText('Numero di porta');
    await userEvent.clear(port);
    await userEvent.type(port, '80');
    await userEvent.click(await toggle());
    expect(await screen.findByText('Inserisci un numero intero da 1024 a 65535.')).toBeTruthy();
    expect(platform.sharingCalls).toHaveLength(0);
  });

  it('parses the range', () => {
    expect([parsePort('1023'), parsePort('1024'), parsePort('65535'), parsePort('65536'), parsePort('x')]).toEqual([null, 1024, 65535, null, null]);
  });
});

describe('turning off', () => {
  it('returns to the off state', async () => {
    const { platform } = renderSharing({ status: { enabled: true, running: true, addresses: ['https://10.0.0.2:7842'], phrase: 'a b c d e f', fingerprint: 'AA' } });
    await userEvent.click(await toggle());
    await waitFor(() => expect(screen.queryByText('https://10.0.0.2:7842')).toBeNull());
    expect(platform.sharingCalls).toEqual([{ enabled: false }]);
    expect(platform.sharingState.running).toBe(false);
  });
});
