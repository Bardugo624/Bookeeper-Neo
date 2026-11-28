import { Navigate, type RouteObject } from 'react-router';
import { EmptyState } from '@bookeeper/ui/base';
import { Shell } from '../shell/Shell';
import { SessionGate } from './SessionGate';
import { RouteError } from './RouteError';
import { Welcome } from './Welcome';
import { useT } from './i18n';
import type { AppModule } from './types';

function firstNav(modules: AppModule[]): string | null {
  const items = modules.flatMap((m) => (m.nav ? [m.nav] : []));
  const main = items.filter((n) => n.group === 'main').sort((a, b) => a.order - b.order);
  return (main[0] ?? items.sort((a, b) => a.order - b.order)[0])?.to ?? null;
}

function Home({ to }: { to: string | null }) {
  const t = useT();
  if (to) return <Navigate to={to} replace />;
  return <EmptyState icon="library" title={t('shell.empty.title')} text={t('shell.empty.text')} />;
}

function NotFound() {
  const t = useT();
  return <EmptyState icon="info" title={t('shell.notFound.title')} text={t('shell.notFound.text')} />;
}

export function publicPaths(modules: AppModule[]): string[] {
  const own = modules.flatMap((m) => m.public ?? []).flatMap((r) => (r.path ? [r.path] : []));
  return own.includes('/welcome') ? own : ['/welcome', ...own];
}

/** Full-window routes of the modules: they have the session, not the shell. */
function screens(modules: AppModule[]): RouteObject[] {
  const own = modules.flatMap((m) => m.screens ?? []);
  return own.length === 0 ? [] : [{ errorElement: <RouteError />, children: own }];
}

export function buildRoutes(modules: AppModule[]): RouteObject[] {
  const home = firstNav(modules);
  const publics = modules.flatMap((m) => m.public ?? []);
  const hasWelcome = publics.some((r) => r.path === '/welcome');
  return [
    {
      element: <SessionGate publicPaths={publicPaths(modules)} home={home} />,
      errorElement: <RouteError />,
      children: [
        ...publics,
        ...(hasWelcome ? [] : [{ path: '/welcome', element: <Welcome /> }]),
        ...screens(modules),
        {
          element: <Shell modules={modules} />,
          // Errors stay inside the content area: sidebar and window controls remain usable.
          children: [
            {
              errorElement: <RouteError />,
              children: [
                { index: true, element: <Home to={home} /> },
                ...modules.flatMap((m) => m.routes),
                { path: '*', element: <NotFound /> },
              ],
            },
          ],
        },
      ],
    },
  ];
}
