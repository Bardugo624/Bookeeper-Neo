import { Navigate, type RouteObject } from 'react-router';
import { EmptyState } from '@bookeeper/ui/base';
import { AppFrame } from '../shell/AppFrame';
import { Shell } from '../shell/Shell';
import { RouteError } from './RouteError';
import { PAIR_PATH, SessionGate } from './SessionGate';
import { useT } from './i18n';
import type { MobileModule } from './types';

function firstTab(modules: MobileModule[]): string | null {
  return modules.flatMap((m) => (m.tab ? [m.tab] : [])).sort((a, b) => a.order - b.order)[0]?.to ?? null;
}

function Home({ to }: { to: string | null }) {
  const t = useT();
  if (to) return <Navigate to={to} replace />;
  return <EmptyState icon="library" title={t('mobile.empty.title')} text={t('mobile.empty.text')} />;
}

function NotFound() {
  const t = useT();
  return <EmptyState icon="info" title={t('mobile.notFound.title')} text={t('mobile.notFound.text')} />;
}

/** Shown on `/pair` when no module provides the pairing page. */
function Unpaired() {
  const t = useT();
  return <EmptyState icon="phone" title={t('mobile.unpaired.title')} text={t('mobile.unpaired.text')} />;
}

export function publicPaths(modules: MobileModule[]): string[] {
  const own = modules.flatMap((m) => m.public ?? []).flatMap((r) => (r.path ? [r.path] : []));
  return own.includes(PAIR_PATH) ? own : [PAIR_PATH, ...own];
}

export function buildRoutes(modules: MobileModule[]): RouteObject[] {
  const home = firstTab(modules);
  const publics = modules.flatMap((m) => m.public ?? []);
  const hasPair = publics.some((r) => r.path === PAIR_PATH);
  return [
    {
      element: <AppFrame />,
      errorElement: <RouteError />,
      children: [
        {
          element: <SessionGate publicPaths={publicPaths(modules)} home={home} />,
          children: [
            ...publics,
            ...(hasPair ? [] : [{ path: PAIR_PATH, element: <Unpaired /> }]),
            // Full screens: the session and the app frame, but not the tab bar.
            ...modules.flatMap((m) => (m.screens ?? []).map((r) => ({ ...r, errorElement: r.errorElement ?? <RouteError /> }))),
            {
              element: <Shell modules={modules} />,
              // Errors stay inside the content area: the tab bar remains usable.
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
      ],
    },
  ];
}
