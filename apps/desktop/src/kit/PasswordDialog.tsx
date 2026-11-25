import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../app/i18n';
import styles from './dialogs.module.css';

export interface PasswordDialogProps {
  open: boolean;
  busy: boolean;
  error: string | null;
  onSubmit(password: string): void;
  onCancel(): void;
}

/** Asks for the password before a destructive operation. Mounted only while open, so it starts empty. */
export function PasswordDialog({ open, busy, error, onSubmit, onCancel }: PasswordDialogProps) {
  const t = useT();
  const [password, setPassword] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) onSubmit(password);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
      title={t('common.password.title')}
      description={t('common.password.description')}
      closeLabel={t('common.close')}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="bk-password-confirm" variant="primary" loading={busy} loadingLabel={t('common.password.working')}>
            {t('common.confirm')}
          </Button>
        </div>
      }
    >
      <form id="bk-password-confirm" className={styles.form} onSubmit={submit}>
        <Field label={t('common.password.label')} error={error ?? undefined}>
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </form>
    </Dialog>
  );
}
