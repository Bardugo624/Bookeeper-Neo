import { NavLink } from 'react-router';
import { Icon, Kbd } from '@bookeeper/ui/base';
import { useT } from '../app/i18n';
import { isMac } from '../app/keyboard';
import { useOverlays } from '../app/overlays';
import { FirstStepsPill, tourAnchor } from '../modules/tour';
import type { AppModule, NavItem } from '../app/types';
import { LibraryBadge } from './LibraryBadge';
import { cx } from './cx';
import styles from './Sidebar.module.css';

type Entry = NavItem & { id: string };

function items(modules: AppModule[], group: NavItem['group']): Entry[] {
  return modules
    .flatMap((m) => (m.nav && m.nav.group === group ? [{ ...m.nav, id: m.id }] : []))
    .sort((a, b) => a.order - b.order);
}

function NavBadge({ use, labelKey }: { use: () => number | null; labelKey: string }) {
  const t = useT();
  const count = use();
  if (!count || count <= 0) return null;
  return (
    <span className={styles.badge} role="img" aria-label={t(labelKey, { count })}>
      {count}
    </span>
  );
}

function NavGroup({ list }: { list: Entry[] }) {
  const t = useT();
  return (
    <>
      {list.map((n) => (
        <NavLink key={n.to} to={n.to} {...tourAnchor(`nav.${n.id}`)} className={({ isActive }) => cx(styles.item, isActive && styles.active)}>
          <Icon name={n.icon} size={17} />
          <span className={styles.label}>{t(n.labelKey)}</span>
          {n.useBadge && n.badgeLabelKey ? <NavBadge use={n.useBadge} labelKey={n.badgeLabelKey} /> : null}
        </NavLink>
      ))}
    </>
  );
}

function PaletteHint() {
  const t = useT();
  const open = useOverlays((s) => s.openPalette);
  return (
    <button type="button" className={styles.hint} onClick={open} {...tourAnchor('nav.search')}>
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
      <div className={styles.steps}>
        <FirstStepsPill />
      </div>
      <LibraryBadge />
    </aside>
  );
}
