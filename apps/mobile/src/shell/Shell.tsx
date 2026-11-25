import { Outlet } from 'react-router';
import type { MobileModule } from '../app/types';
import { TabBar } from './TabBar';
import styles from './Shell.module.css';

/** The paired app: the current view above, the tab bar below. */
export function Shell({ modules }: { modules: MobileModule[] }) {
  const tabs = modules.flatMap((m) => (m.tab ? [m.tab] : [])).sort((a, b) => a.order - b.order);
  return (
    <div className={styles.shell}>
      <main className={styles.content}>
        <Outlet />
      </main>
      <TabBar tabs={tabs} />
    </div>
  );
}
