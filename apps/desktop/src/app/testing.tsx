import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { Locale } from '@bookeeper/i18n';
import { fakePlatform } from '../platform/testing';
import type { Platform } from '../platform';
import { useSession } from '../session';
import { AppProviders } from './AppProviders';
import { buildRoutes } from './routes';
import type { AppModule } from './types';

export interface RenderAppOptions {
  platform?: Platform;
  modules?: AppModule[];
  route?: string;
  locale?: Locale;
}

/** Mounts the whole app (providers, session boot, router) on a memory router. */
export function renderApp({ platform = fakePlatform(), modules = [], route = '/', locale = 'it' }: RenderAppOptions = {}) {
  // The session store is global: start every render from a fresh boot.
  useSession.setState({ status: 'loading', connection: null, me: null, platform: null });
  const router = createMemoryRouter(buildRoutes(modules), { initialEntries: [route] });
  const view = render(
    <AppProviders platform={platform} locale={locale}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router, platform };
}
