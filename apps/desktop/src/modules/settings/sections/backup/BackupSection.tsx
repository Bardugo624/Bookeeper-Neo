import { useT } from '../../../../app/i18n';
import { usePermission } from '../../../../kit';
import { SettingsBlock, SettingsFull } from '../../SettingsBlock';
import { AutoBackupList } from './AutoBackupList';
import { BackupNowBlock } from './BackupNowBlock';
import { RestoreBlock } from './RestoreBlock';
import { ScheduleBlock } from './ScheduleBlock';
import { useBackupOps } from './useBackupOps';

export function BackupSection() {
  const ops = useBackupOps();
  const t = useT();
  const { can } = usePermission();
  return (
    <>
      <BackupNowBlock ops={ops} />
      <ScheduleBlock locked={ops.busy} />
      <AutoBackupList />
      <SettingsBlock title={t('backup.ebooks.title')} description={t('backup.ebooks.text')} />
      {can('owner') ? (
        <SettingsFull>
          <RestoreBlock ops={ops} />
        </SettingsFull>
      ) : null}
    </>
  );
}
