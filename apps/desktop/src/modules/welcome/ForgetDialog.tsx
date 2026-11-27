import { Button } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../../app/i18n';

export interface ForgetDialogProps {
  open: boolean;
  library: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Asks before a saved library is removed from this computer. */
export function ForgetDialog({ open, library, busy, onConfirm, onClose }: ForgetDialogProps) {
  const t = useT();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('welcome.forget.title')}
      tone="danger"
      description={t('welcome.forget.text', { library })}
      closeLabel={t('welcome.forget.close')}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t('welcome.forget.cancel')}
          </Button>
          <Button variant="danger" loading={busy} loadingLabel={t('shell.loading')} onClick={onConfirm}>
            {t('welcome.forget.confirm')}
          </Button>
        </>
      }
    />
  );
}
