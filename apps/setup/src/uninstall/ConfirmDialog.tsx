import { Button } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import type { SetupInfo } from '../bridge';
import { formatBytes, useLocale, useT } from '../shell';
import { variantSuffix } from './ChoicePanel';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  open: boolean;
  data: SetupInfo['data'];
  onCancel(): void;
  onConfirm(): void;
}

/** The only red of the Setup: what «Cancella tutto» takes away. */
export function ConfirmDialog({ open, data, onCancel, onConfirm }: ConfirmDialogProps) {
  const t = useT();
  const locale = useLocale();
  const suffix = variantSuffix(data);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      tone="danger"
      title={t(data.hasLibrary ? 'setup.confirm.title' : 'setup.confirm.titleRemote')}
      closeLabel={t('setup.window.close')}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t('setup.confirm.cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {t('setup.confirm.go')}
          </Button>
        </>
      }
    >
      <p className={styles.text}>{t(`setup.confirm.text${suffix}`, { size: formatBytes(data.bytes, locale) })}</p>
      <p className={styles.note}>{t('setup.confirm.note')}</p>
    </Dialog>
  );
}
