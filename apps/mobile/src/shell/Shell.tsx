import type { ComponentType } from 'react';
import { Outlet } from 'react-router';
import type { MobileModule } from '../app/types';
import { TabBar } from './TabBar';
import styles from './Shell.module.css';

function Background({ component: Component }: { component: ComponentType }) {
  return <Component />;
}

/** The paired app: the current view above, the tab bar below. */
export function Shell({ modules }: { modules: MobileModule[] }) {
  const tabs = modules.flatMap((m) => (m.tab ? [m.tab] : [])).sort((a, b) => a.order - b.order);
  return (
    <div className={styles.shell}>
      {modules.map((m) => (m.background ? <Background key={m.id} component={m.background} /> : null))}
      <main className={styles.content}>
        <Outlet />
      </main>
      <TabBar tabs={tabs} />
    </div>
  );
}
