import { useId, type FormEvent, type ReactNode } from 'react';
import { Button } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../app/i18n';
import styles from './dialogs.module.css';

export interface FormDialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** General (non-field) error shown above the fields, already translated. */
  error?: string | null;
  submitLabel?: string;
  busy?: boolean;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onCancel(): void;
  children: ReactNode;
}

/** A Dialog around a <form>: the Save button sits in the footer and is tied to the form by id. */
export function FormDialog({ open, title, description, error, submitLabel, busy = false, onSubmit, onCancel, children }: FormDialogProps) {
  const t = useT();
  const formId = useId();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
      title={title}
      description={description}
      closeLabel={t('common.close')}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={busy} loadingLabel={t('common.saving')}>
            {submitLabel ?? t('common.save')}
          </Button>
        </div>
      }
    >
      <form id={formId} className={styles.form} onSubmit={onSubmit} noValidate>
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        {children}
      </form>
    </Dialog>
  );
}
