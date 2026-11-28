import { useState } from 'react';
import { Button, Icon } from '@bookeeper/ui/base';
import { useLocale, useT } from '../../app/i18n';
import { formatSize } from '../search/filesModel';
import { InstallSheet } from './InstallSheet';
import { useOfflineFile, type OfflineTarget } from './useOffline';
import styles from './OfflineControl.module.css';

/** «Scarica per leggere offline», with its progress and its «Togli dal telefono». */
export function OfflineControl({ target }: { target: OfflineTarget }) {
  const t = useT();
  const locale = useLocale();
  const offline = useOfflineFile(target);
  const [explain, setExplain] = useState(false);
  const percent = Math.round(offline.progress * 100);

  return (
    <div className={styles.root}>
      {offline.status === 'none' ? (
        <Button
          variant="secondary"
          icon="phone"
          className={styles.wide}
          onClick={() => {
            if (offline.start() === 'explain') setExplain(true);
          }}
        >
          {t('mreader.offline.download')}
        </Button>
      ) : null}
      {offline.status === 'saving' ? (
        <div className={styles.row}>
          <div className={styles.progress}>
            <span role="status">{t('mreader.offline.saving', { percent })}</span>
            <div
              className={styles.bar}
              role="progressbar"
              aria-label={t('mreader.offline.saving', { percent })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <span className={styles.fill} style={{ width: `${percent}%` }} />
            </div>
          </div>
          <Button variant="secondary" className={styles.action} onClick={offline.cancel}>
            {t('mreader.offline.cancel')}
          </Button>
        </div>
      ) : null}
      {offline.status === 'saved' ? (
        <div className={styles.row}>
          <span className={styles.kept}>
            <Icon name="check" size={16} />
            {t('mreader.offline.kept', { size: formatSize(locale, offline.sizeBytes) })}
          </span>
          <Button variant="secondary" className={styles.action} onClick={offline.remove}>
            {t('mreader.offline.remove')}
          </Button>
        </div>
      ) : null}
      {offline.failed ? (
        <p role="alert" className={styles.error}>
          {t('mreader.offline.failed')}
        </p>
      ) : null}
      <InstallSheet open={explain} onOpenChange={setExplain} />
    </div>
  );
}
