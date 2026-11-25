import { NavLink } from 'react-router';
import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { cx } from '../../kit/cx';
import type { SettingsSection } from './types';
import styles from './SettingsPage.module.css';

export function SectionList({ sections }: { sections: SettingsSection[] }) {
  const t = useT();
  return (
    <nav className={styles.list} aria-label={t('settings.sections.label')}>
      {sections.map((s) => (
        <NavLink key={s.id} to={`/settings/${s.id}`} className={({ isActive }) => cx(styles.item, isActive && styles.active)}>
          <Icon name={s.icon} size={17} />
          <span>{t(s.labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
