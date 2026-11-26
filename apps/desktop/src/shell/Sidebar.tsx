import { NavLink } from 'react-router';
import { Icon, Kbd } from '@bookeeper/ui/base';
import { useT } from '../app/i18n';
import { isMac } from '../app/keyboard';
import { useOverlays } from '../app/overlays';
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

function PaletteHint() {
  const t = useT();
  const open = useOverlays((s) => s.openPalette);
  return (
    <button type="button" className={styles.hint} onClick={open}>
      <Icon name="search" size={15} />
      <span>{t('palette.hint')}</span>
      <Kbd>{t(isMac() ? 'palette.keys.hintMac' : 'palette.keys.hint')}</Kbd>
    </button>
  );
}

export function Sidebar({ modules }: { modules: AppModule[] }) {
  const t = useT();
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand} data-tauri-drag-region>
        {t('app.name')}
      </div>
      <PaletteHint />
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
