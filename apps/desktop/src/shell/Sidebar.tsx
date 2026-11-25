import { NavLink } from 'react-router';
import { Icon } from '@bookeeper/ui/base';
import { useT } from '../app/i18n';
import type { AppModule, NavItem } from '../app/types';
import { LibraryBadge } from './LibraryBadge';
import { cx } from './cx';
import styles from './Sidebar.module.css';

function items(modules: AppModule[], group: NavItem['group']): NavItem[] {
  return modules
    .flatMap((m) => (m.nav && m.nav.group === group ? [m.nav] : []))
    .sort((a, b) => a.order - b.order);
}

function NavGroup({ list }: { list: NavItem[] }) {
  const t = useT();
  return (
    <>
      {list.map((n) => (
        <NavLink key={n.to} to={n.to} className={({ isActive }) => cx(styles.item, isActive && styles.active)}>
          <Icon name={n.icon} size={17} />
          <span>{t(n.labelKey)}</span>
        </NavLink>
      ))}
    </>
  );
}

export function Sidebar({ modules }: { modules: AppModule[] }) {
  const t = useT();
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand} data-tauri-drag-region>
        {t('app.name')}
      </div>
      <nav className={styles.nav} aria-label={t('shell.sidebar.label')}>
        <div className={styles.group}>
          <NavGroup list={items(modules, 'main')} />
        </div>
        <div className={styles.group}>
          <NavGroup list={items(modules, 'bottom')} />
        </div>
      </nav>
      <LibraryBadge />
    </aside>
  );
}
