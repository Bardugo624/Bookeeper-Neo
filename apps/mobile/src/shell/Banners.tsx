import { Button, Icon } from '@bookeeper/ui/base';
import { useT } from '../app/i18n';
import { useOnline, useUpdate } from './hooks';
import styles from './Banners.module.css';

export function useBannersVisible(): boolean {
  const online = useOnline();
  const { ready } = useUpdate();
  return !online || ready;
}

/** Offline strip and the "new version" banner. Neither blocks the view below. */
export function Banners() {
  const t = useT();
  const online = useOnline();
  const { ready, apply } = useUpdate();
  if (online && !ready) return null;
  return (
    <div className={styles.banners}>
      {!online && (
        <div className={styles.offline} role="status">
          <Icon name="wifi" size={16} />
          <span>{t('mobile.offline')}</span>
        </div>
      )}
      {ready && (
        <div className={styles.update} role="status">
          <span className={styles.text}>{t('mobile.update.text')}</span>
          <Button size="sm" variant="secondary" onClick={apply}>
            {t('mobile.update.action')}
          </Button>
        </div>
      )}
    </div>
  );
}
