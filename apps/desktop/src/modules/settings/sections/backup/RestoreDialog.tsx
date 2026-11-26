import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../../../../app/i18n';

export interface RestoreDialogProps {
  libraryName: string;
  fileName: string;
  onConfirm(): void;
  onCancel(): void;
}

/** Step one of the restore: type the library name to enable the button. Mounted only while open. */
export function RestoreDialog({ libraryName, fileName, onConfirm, onCancel }: RestoreDialogProps) {
  const t = useT();
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === libraryName;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (matches) onConfirm();
  };
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      tone="danger"
      title={t('backup.restore.dialog.title')}
      description={t('backup.restore.dialog.description', { file: fileName })}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" disabled={!matches} onClick={onConfirm}>
            {t('backup.restore.dialog.confirm')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field label={t('backup.restore.dialog.typeName', { name: libraryName })}>
          <Input value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
