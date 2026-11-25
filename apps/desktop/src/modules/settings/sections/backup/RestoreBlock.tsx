import { Button, Icon } from '@bookeeper/ui/base';
import { useT } from '../../../../app/i18n';
import { SettingsBlock } from '../../SettingsBlock';
import { useSettingsSession } from '../../useSettingsSession';
import { RestoreDialog } from './RestoreDialog';
import { RestoreReportView } from './RestoreReportView';
import type { BackupOps } from './useBackupOps';
import { useRestore } from './useRestore';
import styles from './BackupSection.module.css';

export function RestoreBlock({ ops }: { ops: BackupOps }) {
  const t = useT();
  const { me, connection } = useSettingsSession();
  const restore = useRestore(ops);
  const libraryName = me?.library.name ?? connection?.library_name ?? '';
  const restoring = ops.active === 'restore';

  return (
    <SettingsBlock title={t('backup.restore.title')} description={t('backup.restore.description')}>
      <div className={styles.warning} role="note">
        <Icon name="alert" />
        <p>{t('backup.restore.warning')}</p>
      </div>
      <label className={styles.note}>
        {t('backup.restore.file')}
        <input
          key={restore.inputKey}
          type="file"
          accept=".zip,application/zip"
          disabled={ops.busy}
          onChange={(e) => restore.pick(e.target.files?.[0] ?? null)}
        />
      </label>
      <Button
        variant="danger"
        disabled={!restore.file || (ops.busy && !restoring) || libraryName === ''}
        loading={restoring}
        loadingLabel={t('backup.restore.working')}
        onClick={() => restore.setAsking(true)}
      >
        {t('backup.restore.action')}
      </Button>
      {restore.error ? (
        <p className={styles.error} role="alert">
          {restore.error}
        </p>
      ) : null}
      {restore.report ? <RestoreReportView report={restore.report} /> : null}
      {restore.asking && restore.file ? (
        <RestoreDialog libraryName={libraryName} fileName={restore.file.name} onConfirm={() => void restore.start()} onCancel={() => restore.setAsking(false)} />
      ) : null}
      {restore.passwordDialog}
    </SettingsBlock>
  );
}
