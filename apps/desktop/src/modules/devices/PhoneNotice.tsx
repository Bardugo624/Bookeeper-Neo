import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app';
import styles from './PhoneNotice.module.css';

/** Why there is no "add a phone" button: the library has no secure address yet. */
export function PhoneNotice() {
  const t = useT();
  return (
    <aside className={styles.notice} aria-label={t('devices.phoneNotice.title')}>
      <Icon name="info" size={18} />
      <div>
        <p className={styles.title}>{t('devices.phoneNotice.title')}</p>
        <p className={styles.text}>{t('devices.phoneNotice.text')}</p>
      </div>
    </aside>
  );
}
