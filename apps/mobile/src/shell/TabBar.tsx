import { NavLink } from 'react-router';
import { Icon } from '@bookeeper/ui/base';
import { useT } from '../app/i18n';
import type { TabItem } from '../app/types';
import styles from './TabBar.module.css';

export function TabBar({ tabs }: { tabs: TabItem[] }) {
  const t = useT();
  if (tabs.length === 0) return null;
  return (
    <nav className={styles.bar} aria-label={t('mobile.tabs')}>
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className={styles.tab}>
          <Icon name={tab.icon} size={22} />
          <span className={styles.label}>{t(tab.labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
