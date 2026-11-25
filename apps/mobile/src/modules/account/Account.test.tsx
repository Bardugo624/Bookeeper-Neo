import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LOCALES, t } from '@bookeeper/i18n';
import { resetLocalePreferenceForTest } from '../../app/i18n';
import { renderMobile } from '../../app/testing';
import { resetThemePreferenceForTest } from '../../app/theme';
import type { MobileModule } from '../../app/types';
import { fakePlatform, type FakePlatform, type Handler } from '../../platform/testing';
import { SESSION_KEY, useSession } from '../../session';
import { ME, ok, pair } from '../../session/fixtures';
import { AccountRoute } from './AccountRoute';
import type { InstallState } from './install';
import { fakeInstaller } from './testing';
import { module as accountModule } from './routes';

const pairPage: MobileModule = { id: 'pair', routes: [], public: [{ path: '/pair', element: <p>Pagina abbinamento</p> }] };
const apiError = (status: number, code: string) => ({ status, body: { error_code: code, message: 'x' } });

function platformWith(extra: Handler = () => apiError(404, 'not_found')): FakePlatform {
  const p = fakePlatform({
    handler: (c) => {
      if (c.path === '/api/v1/me') return ok(ME);
      if (c.path === '/api/v1/health') return ok({ status: 'ok', time: 'x', version: '0.9.1' });
      return extra(c);
    },
  });
  pair(p.storage);
  return p;
}

function open(p: FakePlatform, state: InstallState = 'none') {
  const installer = fakeInstaller(state);
  const module: MobileModule = { ...accountModule, routes: [{ path: '/account', element: <AccountRoute installer={installer} /> }] };
  const view = renderMobile({ platform: p, modules: [module, pairPage], route: '/account' });
  return { ...view, installer };
}

beforeEach(() => {
  localStorage.clear();
  resetThemePreferenceForTest();
  resetLocalePreferenceForTest();
  document.documentElement.classList.remove('dark');
});

describe('who you are', () => {
  it('shows library, name, role, device and versions', async () => {
    open(platformWith());
    expect(await screen.findByText('Casa Rossi')).toBeInTheDocument();
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Proprietario')).toBeInTheDocument();
    expect(screen.getByText('iPhone · Safari')).toBeInTheDocument();
    expect(await screen.findByText('0.9.1')).toBeInTheDocument();
  });

  it('renames the device with a trimmed name and shows it', async () => {
    const p = platformWith((c) => (c.method === 'PATCH' ? ok({ ...ME.device, name: 'Telefono di Anna' }) : apiError(404, 'not_found')));
    open(p);
    await userEvent.click(await screen.findByRole('button', { name: 'Rinomina' }));
    const field = screen.getByLabelText('Nome del telefono');
    await userEvent.clear(field);
    await userEvent.type(field, '  Telefono di Anna  ');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByText('Telefono di Anna')).toBeInTheDocument();
    const patch = p.fake.calls.find((c) => c.method === 'PATCH')!;
    expect(patch.path).toBe('/api/v1/devices/d1');
    expect(patch.body).toEqual({ name: 'Telefono di Anna' });
  });

  it('refuses an empty or too long name without a request', async () => {
    const p = platformWith();
    open(p);
    await userEvent.click(await screen.findByRole('button', { name: 'Rinomina' }));
    const field = screen.getByLabelText('Nome del telefono');
    await userEvent.clear(field);
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByText('Scrivi un nome per il telefono.')).toBeInTheDocument();
    await userEvent.click(field);
    await userEvent.paste('x'.repeat(81));
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByText('Il nome può avere al massimo 80 caratteri.')).toBeInTheDocument();
    expect(p.fake.calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('shows the server error and keeps the form', async () => {
    open(platformWith((c) => (c.method === 'PATCH' ? apiError(500, 'internal') : apiError(404, 'not_found'))));
    await userEvent.click(await screen.findByRole('button', { name: 'Rinomina' }));
    await userEvent.type(screen.getByLabelText('Nome del telefono'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByText(t('it', 'common.errors.generic'))).toBeInTheDocument();
    expect(screen.getByLabelText('Nome del telefono')).toBeInTheDocument();
  });
});

describe('appearance', () => {
  it('applies and stores the theme', async () => {
    open(platformWith());
    const theme = within(await screen.findByRole('radiogroup', { name: 'Tema' }));
    expect(theme.getByRole('radio', { name: 'Sistema' })).toBeChecked();
    await userEvent.click(theme.getByRole('radio', { name: 'Scuro' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('bookeeper.theme')).toBe('dark');
    await userEvent.click(theme.getByRole('radio', { name: 'Chiaro' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('switches language without reloading and stores it', async () => {
    open(platformWith());
    const language = within(await screen.findByRole('radiogroup', { name: 'Lingua' }));
    await userEvent.click(language.getByRole('radio', { name: 'English' }));
    expect(localStorage.getItem('bookeeper.locale')).toBe('en');
    expect(await screen.findByRole('radiogroup', { name: 'Language' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Lingua' })).toBeNull();
  });
});

describe('install', () => {
  it('prompts from the button when the browser offers installation', async () => {
    const { installer } = open(platformWith(), 'promptable');
    await userEvent.click(await screen.findByRole('button', { name: 'Aggiungi alla schermata Home' }));
    expect(installer.prompt).toHaveBeenCalledOnce();
  });

  it('explains the steps on iOS', async () => {
    open(platformWith(), 'ios');
    expect(await screen.findByText('Tocca Condividi nella barra di Safari.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aggiungi alla schermata Home' })).toBeNull();
  });

  it.each<InstallState>(['installed', 'none'])('has no section when %s', async (state) => {
    open(platformWith(), state);
    await screen.findByText('Casa Rossi');
    expect(screen.queryByText("Installa l'app")).toBeNull();
  });

  it('drops the section once the app gets installed', async () => {
    const { installer } = open(platformWith(), 'promptable');
    await screen.findByText("Installa l'app");
    installer.set('installed');
    await waitFor(() => expect(screen.queryByText("Installa l'app")).toBeNull());
  });
});

describe('updates', () => {
  it('asks the platform and says the app is up to date', async () => {
    const p = platformWith();
    open(p);
    await userEvent.click(await screen.findByRole('button', { name: 'Cerca aggiornamenti' }));
    expect(p.serviceWorker.checkForUpdate).toHaveBeenCalledOnce();
    expect(await screen.findByText("L'app è aggiornata.")).toBeInTheDocument();
  });

  it('says so when a new version is already waiting', async () => {
    const p = platformWith();
    p.serviceWorker.checkForUpdate.mockResolvedValue(true);
    open(p);
    await userEvent.click(await screen.findByRole('button', { name: 'Cerca aggiornamenti' }));
    expect(await screen.findByText(/usa il banner/)).toBeInTheDocument();
  });
});

describe('disconnect', () => {
  const LOGOUT = '/api/v1/auth/logout';

  it('asks first, then logs out, forgets the session and goes to /pair', async () => {
    const p = platformWith((c) => (c.path === LOGOUT ? { status: 204, body: null } : apiError(404, 'not_found')));
    const { router } = open(p);
    await userEvent.click(await screen.findByRole('button', { name: 'Scollega questo telefono' }));
    expect(p.fake.calls.some((c) => c.path === LOGOUT)).toBe(false);
    await userEvent.click(await screen.findByRole('button', { name: 'Scollega' }));
    expect(await screen.findByText('Pagina abbinamento')).toBeInTheDocument();
    expect(p.fake.calls.filter((c) => c.path === LOGOUT)).toHaveLength(1);
    expect(p.storage.get(SESSION_KEY)).toBeNull();
    expect(router.state.location.pathname).toBe('/pair');
  });

  it('cancel leaves everything as it was', async () => {
    const p = platformWith();
    open(p);
    await userEvent.click(await screen.findByRole('button', { name: 'Scollega questo telefono' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
    expect(p.storage.get(SESSION_KEY)).not.toBeNull();
    expect(p.fake.calls.some((c) => c.path === LOGOUT)).toBe(false);
  });

  it('on a network error forgets the session anyway and says to revoke from the computer', async () => {
    const p = platformWith((c) => {
      if (c.path === LOGOUT) throw new TypeError('Failed to fetch');
      return apiError(404, 'not_found');
    });
    open(p);
    await userEvent.click(await screen.findByRole('button', { name: 'Scollega questo telefono' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Scollega' }));
    expect(await screen.findByText('Pagina abbinamento')).toBeInTheDocument();
    expect(await screen.findByText(/va revocato dal computer/)).toBeInTheDocument();
    expect(p.storage.get(SESSION_KEY)).toBeNull();
    expect(useSession.getState().status).toBe('unpaired');
  });
});

describe('texts', () => {
  const dir = import.meta.glob('./*.tsx', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
  const keys = new Set(
    Object.values(dir).flatMap((src) => [...src.matchAll(/['"`](maccount\.[\w.]+)['"`]/g)].map((m) => m[1]!)),
  );
  const roles = ['owner', 'admin', 'member', 'guest'].map((r) => `maccount.who.roles.${r}`);
  const about = ['upToDate', 'updateReady'].map((k) => `maccount.about.${k}`);
  it.each(LOCALES.flatMap((l) => [...keys, ...roles, ...about].map((k) => [l, k] as const)))('%s has %s', (locale, key) => {
    expect(t(locale, key)).not.toBe(key);
  });
});
