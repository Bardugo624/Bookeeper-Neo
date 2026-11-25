import { Button } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../../app/i18n';
import { ReleaseNotes } from './ReleaseNotes';
import type { UseUpdates } from './useUpdates';
import styles from './updates.module.css';

export interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updates: UseUpdates;
}

/** Release notes and the install button; it cannot be closed while the update installs. */
export function UpdateDialog({ open, onOpenChange, updates }: UpdateDialogProps) {
  const t = useT();
  const { result, installing, progress, installError, controller } = updates;
  if (result?.state !== 'available') return null;
  const percent = progress?.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!installing) onOpenChange(next);
      }}
      title={t('updates.dialog.title', { version: result.version })}
      closeLabel={t('updates.dialog.close')}
      footer={
        <Button
          variant="primary"
          loading={installing}
          loadingLabel={t('updates.dialog.installing')}
          onClick={() => void controller?.install()}
        >
          {installError ? t('updates.dialog.retry') : t('updates.dialog.install')}
        </Button>
      }
    >
      {result.notes.trim() ? <ReleaseNotes text={result.notes} /> : <p className={styles.muted}>{t('updates.dialog.noNotes')}</p>}
      {installing ? (
        <div className={styles.progress}>
          <progress
            aria-label={t('updates.dialog.progress')}
            max={percent === null ? undefined : 100}
            value={percent === null ? undefined : percent}
          />
          <p className={styles.muted}>{t('updates.dialog.installingHint')}</p>
        </div>
      ) : null}
      {installError ? (
        <p className={styles.error} role="alert">
          {t(`updates.errors.${installError}`)}
        </p>
      ) : null}
    </Dialog>
  );
}
