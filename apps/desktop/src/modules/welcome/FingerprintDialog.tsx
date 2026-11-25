import { Button } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../../app/i18n';
import styles from './form.module.css';

export interface FingerprintDialogProps {
  /** The six words; `null` keeps the dialog closed. */
  phrase: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Shows the verification phrase of a certificate this computer does not know. */
export function FingerprintDialog({ phrase, onConfirm, onCancel }: FingerprintDialogProps) {
  const t = useT();
  return (
    <Dialog
      open={phrase !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={t('welcome.phrase.title')}
      description={t('welcome.phrase.text')}
      closeLabel={t('welcome.phrase.close')}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t('welcome.phrase.cancel')}
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            {t('welcome.phrase.match')}
          </Button>
        </>
      }
    >
      <ul className={styles.words} aria-label={t('welcome.phrase.words')}>
        {(phrase ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .map((word, i) => (
            <li key={`${i}-${word}`} className={styles.word}>
              {word}
            </li>
          ))}
      </ul>
    </Dialog>
  );
}
