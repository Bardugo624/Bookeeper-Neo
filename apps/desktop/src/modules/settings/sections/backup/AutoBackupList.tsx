import { Button } from '@bookeeper/ui/base';
import { useLocale, useT } from '../../../../app/i18n';
import { apiErrorMessage } from '../../../../kit';
import { SettingsBlock } from '../../SettingsBlock';
import { formatBytes, formatDateTime } from './backupFormat';
import { useBackupList } from './useBackupData';
import styles from './BackupSection.module.css';

/** Automatic backups kept on the server. The core has no download route for them, so there is no "Download". */
export function AutoBackupList() {
  const t = useT();
  const locale = useLocale();
  const list = useBackupList();
  const items = list.data?.items ?? [];

  return (
    <SettingsBlock title={t('backup.auto.title')} description={t('backup.auto.description')}>
      {list.isError ? (
        <div className={styles.errorRow} role="alert">
          <p className={styles.error}>{apiErrorMessage(t, list.error)}</p>
          <Button variant="ghost" size="sm" onClick={() => void list.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : list.isPending ? (
        <p className={styles.note}>{t('backup.auto.loading')}</p>
      ) : items.length === 0 ? (
        <p className={styles.note}>{t('backup.auto.empty')}</p>
      ) : (
        <ul className={styles.list} aria-label={t('backup.auto.title')}>
          {items.map((b) => (
            <li key={b.name} className={styles.item}>
              <span>{formatDateTime(locale, b.created_at)}</span>
              <span className={styles.size}>{formatBytes(locale, b.size_bytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </SettingsBlock>
  );
}
