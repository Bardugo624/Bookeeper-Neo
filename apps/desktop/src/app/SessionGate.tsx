import { matchPath, Navigate, Outlet, useLocation } from 'react-router';
import { Spinner } from '@bookeeper/ui/base';
import { useSession } from '../session';
import { useT } from './i18n';
import styles from './SessionGate.module.css';

export interface SessionGateProps {
  publicPaths: string[];
  /** First navigation target once signed in; `null` when no module has a nav entry. */
  home: string | null;
}

/** Sends the visitor to the side of the app that matches the session state. */
export function SessionGate({ publicPaths, home }: SessionGateProps) {
  const t = useT();
  const status = useSession((s) => s.status);
  const { pathname } = useLocation();
  const isPublic = publicPaths.some((p) => matchPath({ path: p, end: false }, pathname));

  if (status === 'loading') {
    return (
      <div className={styles.loading}>
        <Spinner label={t('shell.loading')} />
      </div>
    );
  }
  if (status === 'welcome' && !isPublic) return <Navigate to="/welcome" replace />;
  if (status === 'ready' && isPublic) return <Navigate to={home ?? '/'} replace />;
  return <Outlet />;
}
