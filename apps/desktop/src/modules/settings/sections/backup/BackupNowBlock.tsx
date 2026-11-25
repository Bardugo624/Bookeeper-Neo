import { useState } from 'react';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../../../../app/i18n';
import { apiErrorMessage } from '../../../../kit';
import { SettingsBlock } from '../../SettingsBlock';
import type { BackupOps } from './useBackupOps';
import styles from './BackupSection.module.css';

export function BackupNowBlock({ ops }: { ops: BackupOps }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const run = async () => {
    setError(null);
    setSaved(false);
    try {
      setSaved((await ops.backupNow()) === 'saved');
    } catch (e) {
      setError(apiErrorMessage(t, e));
    }
  };

  return (
    <SettingsBlock title={t('backup.now.title')} description={t('backup.now.description')}>
      <Button
        variant="primary"
        loading={ops.active === 'backup'}
        loadingLabel={t('backup.now.working')}
        disabled={ops.busy && ops.active !== 'backup'}
        onClick={() => void run()}
      >
        {t('backup.now.action')}
      </Button>
      {saved ? (
        <p className={styles.note} role="status">
          {t('backup.now.saved')}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </SettingsBlock>
  );
}
