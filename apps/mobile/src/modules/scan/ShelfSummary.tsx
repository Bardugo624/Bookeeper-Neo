import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { countKind, type SessionState, type StepKind } from './shelfReducer';
import styles from './Shelf.module.css';

export interface ShelfSummaryProps {
  state: SessionState;
  onAgain: () => void;
  onClose: () => void;
}

const KINDS: StepKind[] = ['placed', 'moved', 'added', 'skipped'];

/** What the session did, in the order of the scanning. */
export function ShelfSummary({ state, onAgain, onClose }: ShelfSummaryProps) {
  const t = useT();
  return (
    <div className={styles.stack}>
      {state.status === 'full' ? (
        <p className={styles.feedbackError} role="alert">
          {t('mscan.shelf.summary.full')}
        </p>
      ) : null}
      <h2 className={styles.heading}>{t('mscan.shelf.summary.title')}</h2>
      <ul className={styles.counts}>
        {KINDS.map((kind) => (
          <li key={kind}>{t(`mscan.shelf.summary.${kind}`, { count: countKind(state.steps, kind) })}</li>
        ))}
      </ul>
      {state.steps.length > 0 ? (
        <ol className={styles.titles} aria-label={t('mscan.shelf.summary.list')}>
          {state.steps.map((s, i) => (
            <li key={i}>
              <span>{s.title}</span>
              <span className={styles.kind}>{t(`mscan.shelf.summary.kind.${s.kind}`)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.muted}>{t('mscan.shelf.summary.empty')}</p>
      )}
      <div className={styles.actions}>
        <Button variant="primary" onClick={onAgain}>
          {t('mscan.shelf.summary.again')}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t('mscan.shelf.summary.close')}
        </Button>
      </div>
    </div>
  );
}
