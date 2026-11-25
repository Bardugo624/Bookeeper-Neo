import { Link, useLocation } from 'react-router';
import { Icon } from '@bookeeper/ui/base';
import { useT } from '../app/i18n';
import type { TabItem } from '../app/types';
import styles from './TabBar.module.css';

const within = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

const isActive = (tab: TabItem, pathname: string) =>
  [tab.to, ...(tab.also ?? [])].some((base) => within(pathname, base));

export function TabBar({ tabs }: { tabs: TabItem[] }) {
  const t = useT();
  const { pathname } = useLocation();
  if (tabs.length === 0) return null;
  return (
    <nav className={styles.bar} aria-label={t('mobile.tabs')}>
      {tabs.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          className={styles.tab}
          aria-current={isActive(tab, pathname) ? 'page' : undefined}
        >
          <Icon name={tab.icon} size={22} />
          <span className={styles.label}>{t(tab.labelKey)}</span>
        </Link>
      ))}
    </nav>
  );
}
