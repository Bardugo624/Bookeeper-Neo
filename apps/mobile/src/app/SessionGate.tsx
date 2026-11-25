import { matchPath, Navigate, Outlet, useLocation } from 'react-router';
import { Spinner } from '@bookeeper/ui/base';
import { useSession } from '../session';
import { useT } from './i18n';
import styles from './SessionGate.module.css';

export const PAIR_PATH = '/pair';

export interface SessionGateProps {
  publicPaths: string[];
  /** Where a paired phone goes from a public page; `null` when no module has a tab. */
  home: string | null;
}

/** Sends the visitor to the side of the app that matches the session state. */
export function SessionGate({ publicPaths, home }: SessionGateProps) {
  const t = useT();
  const status = useSession((s) => s.status);
  const { pathname, search } = useLocation();
  const isPublic = publicPaths.some((p) => matchPath({ path: p, end: false }, pathname));

  if (status === 'loading') {
    return (
      <div className={styles.loading}>
        <Spinner label={t('mobile.loading')} />
      </div>
    );
  }
  if (status === 'unpaired' && !isPublic) return <Navigate to={PAIR_PATH} replace />;
  // A pairing link opened on a phone that is already paired keeps its code for the page.
  const pairingLink = matchPath({ path: PAIR_PATH, end: false }, pathname) && new URLSearchParams(search).has('code');
  if (status === 'ready' && isPublic && !pairingLink) return <Navigate to={home ?? '/'} replace />;
  return <Outlet />;
}
