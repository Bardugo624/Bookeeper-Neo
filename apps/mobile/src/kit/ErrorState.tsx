import { Button, EmptyState } from '@bookeeper/ui/base';
import { useT } from '../app/i18n';
import styles from './ErrorState.module.css';

export interface ErrorStateProps {
  /** Already translated, e.g. from `apiErrorMessage`. */
  message: string;
  onRetry: () => void;
}

/** A failed view with a "Riprova" button. */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const t = useT();
  return (
    <EmptyState
      icon="alert"
      title={t('mobile.error.title')}
      text={message}
      action={
        <>
          <p className={styles.hint}>{t('mobile.error.hint')}</p>
          <Button variant="secondary" onClick={onRetry}>
            {t('mobile.error.retry')}
          </Button>
        </>
      }
    />
  );
}
