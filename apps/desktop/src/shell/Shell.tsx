import { Outlet, useLocation } from 'react-router';
import type { AppModule } from '../app/types';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import styles from './Shell.module.css';

export function Shell({ modules }: { modules: AppModule[] }) {
  const { pathname } = useLocation();
  return (
    <div className={styles.shell}>
      <Sidebar modules={modules} />
      <div className={styles.column}>
        <TitleBar />
        {/* Keyed by path so each route change replays the entrance. */}
        <main className={styles.content} key={pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
