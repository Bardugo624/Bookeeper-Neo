import type { RestoreReport } from '@bookeeper/api';
import { useT } from '../../../../app/i18n';
import styles from './BackupSection.module.css';

export function RestoreReportView({ report }: { report: RestoreReport }) {
  const t = useT();
  const rows: Array<[string, number]> = [
    [t('backup.restore.report.books'), report.books],
    [t('backup.restore.report.shelves'), report.shelves],
    [t('backup.restore.report.loans'), report.loans],
    [t('backup.restore.report.wishlist'), report.wishlist],
    [t('backup.restore.report.covers'), report.covers],
  ];
  return (
    <div role="status" aria-label={t('backup.restore.report.title')}>
      <p className={styles.note}>{t('backup.restore.report.done')}</p>
      <dl className={styles.report}>
        {rows.map(([label, n]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{n}</dd>
          </div>
        ))}
      </dl>
      {report.users_remapped > 0 ? <p className={styles.note}>{t('backup.restore.report.remapped', { count: report.users_remapped })}</p> : null}
    </div>
  );
}
