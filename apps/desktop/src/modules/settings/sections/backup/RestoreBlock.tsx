import { Button, DangerAction, DangerZone } from '@bookeeper/ui/base';
import { useT } from '../../../../app/i18n';
import { FilePicker } from '../../../../kit';
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
    <DangerZone title={t('settings.danger.title')} headingLevel="h2">
      <DangerAction
        title={t('settings.danger.restore.title')}
        consequence={t('settings.danger.restore.consequence')}
        action={
          <Button
            variant="danger"
            disabled={!restore.file || (ops.busy && !restoring) || libraryName === ''}
            loading={restoring}
            loadingLabel={t('backup.restore.working')}
            onClick={() => restore.setAsking(true)}
          >
            {t('backup.restore.action')}
          </Button>
        }
      />
      <div className={styles.restoreBody}>
        <FilePicker
          key={restore.inputKey}
          label={t('common.file.choose')}
          inputLabel={t('backup.restore.file')}
          accept=".zip,application/zip"
          fileName={restore.file?.name}
          disabled={ops.busy}
          onPick={restore.pick}
        />
        {restore.file || restore.report ? null : <p className={styles.note}>{t('backup.restore.needFile')}</p>}
        {restore.error ? (
          <p className={styles.error} role="alert">
            {restore.error}
          </p>
        ) : null}
        {restore.report ? <RestoreReportView report={restore.report} /> : null}
      </div>
      {restore.asking && restore.file ? (
        <RestoreDialog libraryName={libraryName} fileName={restore.file.name} onConfirm={() => void restore.start()} onCancel={() => restore.setAsking(false)} />
      ) : null}
      {restore.passwordDialog}
    </DangerZone>
  );
}
