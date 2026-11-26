import { useT } from '../../../../app/i18n';
import { SettingsBlock } from '../../SettingsBlock';
import styles from './NotificationsSection.module.css';
import { useNotifications } from './useNotifications';

export function NotificationsSection() {
  const t = useT();
  const { enabled, permission, ready, toggle } = useNotifications();

  return (
    <SettingsBlock title={t('notifications.title')} description={t('notifications.description')}>
      <label className={styles.toggle}>
        <input type="checkbox" role="switch" checked={enabled} disabled={!ready} aria-busy={!ready} onChange={(e) => toggle(e.target.checked)} />
        <span>{t('notifications.overdue')}</span>
      </label>
      {!ready ? (
        <p className={styles.note} role="status">
          {t('notifications.checking')}
        </p>
      ) : null}
      {permission === 'denied' ? (
        <p className={styles.note} role="note">
          {t('notifications.denied')}
        </p>
      ) : null}
    </SettingsBlock>
  );
}
