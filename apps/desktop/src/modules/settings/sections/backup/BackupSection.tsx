import { usePermission } from '../../../../kit';
import { AutoBackupList } from './AutoBackupList';
import { BackupNowBlock } from './BackupNowBlock';
import { RestoreBlock } from './RestoreBlock';
import { ScheduleBlock } from './ScheduleBlock';
import { useBackupOps } from './useBackupOps';

export function BackupSection() {
  const ops = useBackupOps();
  const { can } = usePermission();
  return (
    <>
      <BackupNowBlock ops={ops} />
      <ScheduleBlock locked={ops.busy} />
      <AutoBackupList />
      {can('owner') ? <RestoreBlock ops={ops} /> : null}
    </>
  );
}
