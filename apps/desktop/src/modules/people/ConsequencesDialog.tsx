import { useState } from 'react';
import { Button } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import styles from './ConsequencesDialog.module.css';

export interface ConsequencesDialogProps {
  title: string;
  intro: string;
  /** What will happen, one line each. */
  consequences: string[];
  confirmLabel: string;
  tone?: 'danger';
  /** Runs the action; the dialog closes when it resolves and shows the error when it rejects. */
  run(): Promise<unknown>;
  onClose(): void;
}

/** A confirmation that lists what the action does before it is done. Mounted only while open. */
export function ConsequencesDialog({ title, intro, consequences, confirmLabel, tone, run, onClose }: ConsequencesDialogProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await run();
      onClose();
    } catch (e) {
      setError(apiErrorMessage(t, e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
      title={title}
      description={intro}
      closeLabel={t('common.close')}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} loadingLabel={t('common.saving')} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className={styles.body}>
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        <ul className={styles.list}>
          {consequences.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
