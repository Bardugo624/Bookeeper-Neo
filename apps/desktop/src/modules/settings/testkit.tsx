import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { Locale } from '@bookeeper/i18n';
import type { MeOut } from '@bookeeper/api';
import { AppProviders } from '../../app/AppProviders';
import { buildRoutes } from '../../app/routes';
import type { AppModule } from '../../app/types';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../platform/testing';
import type { Connection } from '../../platform';
import { useSession } from '../../session';
import { ME, ok } from '../../session/fixtures';
import { module } from './routes';

export interface SettingsWorld {
  role?: MeOut['user']['role'];
  email?: string | null;
  connection?: Partial<Connection>;
  health?: { version: string };
  server?: { phone_ready: boolean; public_url: string | null; tls?: 'local' | 'off' | 'self' | 'acme'; version?: string };
  /** Answer for `POST /auth/password`; default is 204. */
  password?: (body: { current_password?: string | null; new_password: string }) => { status: number; body: unknown };
}

export function settingsPlatform(world: SettingsWorld = {}): FakePlatform {
  const me = {
    ...ME,
    user: { ...ME.user, role: world.role ?? 'owner', email: world.email === undefined ? 'anna@example.org' : world.email },
  } as MeOut;
  return fakePlatform({
    connections: { active: 'c1', items: [fakeConnection(world.connection)] },
    handler: (r) => {
      const p = r.path.split('?')[0]!;
      if (p === '/api/v1/me') return ok(me);
      if (p === '/api/v1/auth/logout') return { status: 204, body: undefined };
      if (p === '/api/v1/health') return ok({ status: 'ok', time: 'now', ...(world.health ?? { version: '2.0.1' }) });
      if (p === '/api/v1/server') return ok({ version: '2.0.1', tls: 'local', ...(world.server ?? { phone_ready: false, public_url: null }) });
      if (p === '/api/v1/auth/password') {
        const answer = world.password?.(r.body as never) ?? { status: 204, body: undefined };
        return answer;
      }
      return { status: 404, body: { error_code: 'not_found', message: 'x' } };
    },
  });
}

/** jsdom reports `en-US`; tests run in Italian unless they say otherwise. */
export function setSystemLanguage(lang: string): void {
  Object.defineProperty(window.navigator, 'language', { value: lang, configurable: true });
}

/** Mounts the app with the real settings module. `locale` stays unset so the stored preference decides. */
export interface RenderOptions {
  modules?: AppModule[];
  /** Forces the language (tests of the preference leave it unset). */
  locale?: Locale;
  /** What `navigator.language` reports. */
  language?: string;
}

export function renderSettings(world: SettingsWorld = {}, route = '/settings', { modules = [module], locale, language = 'it-IT' }: RenderOptions = {}) {
  const platform = settingsPlatform(world);
  setSystemLanguage(language);
  useSession.setState({ status: 'loading', connection: null, me: null, platform: null });
  const router = createMemoryRouter(buildRoutes(modules), { initialEntries: [route] });
  const view = render(
    <AppProviders platform={platform} locale={locale}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router, platform };
}
