import { Outlet, useLocation } from 'react-router';
import { useShortcuts } from '../app/useShortcuts';
import type { AppModule } from '../app/types';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import styles from './Shell.module.css';

export function Shell({ modules }: { modules: AppModule[] }) {
  const { pathname } = useLocation();
  useShortcuts(modules);
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
      {modules.map((m) => (m.overlay ? <m.overlay key={m.id} modules={modules} /> : null))}
    </div>
  );
}
