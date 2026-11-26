import type { ShelfOut } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { useT, type Translate } from '../../app/i18n';
import type { Feedback } from './shelfReducer';
import styles from './Shelf.module.css';

function fromText(t: Translate, f: Feedback, shelves: ShelfOut[]): string {
  const from = f.from;
  if (!from) return '';
  const name = shelves.find((s) => s.id === from.shelfId)?.name ?? '';
  return name
    ? t('mscan.shelf.feedback.fromShelf', { shelf: name, row: from.row + 1 })
    : t('mscan.shelf.feedback.fromRow', { row: from.row + 1 });
}

function lineOf(t: Translate, f: Feedback, shelves: ShelfOut[]): string {
  const slot = (f.slot ?? 0) + 1;
  switch (f.kind) {
    case 'placed':
      return t('mscan.shelf.feedback.placed', { title: f.title, slot });
    case 'moved':
      return t('mscan.shelf.feedback.moved', { title: f.title, slot, from: fromText(t, f, shelves) });
    case 'added':
      return t('mscan.shelf.feedback.added', { title: f.title, slot });
    case 'here':
      return t('mscan.shelf.feedback.here', { title: f.title, slot });
    case 'skipped':
      return t('mscan.shelf.feedback.skipped', { isbn: f.title });
    case 'undone':
      return t('mscan.shelf.feedback.undone', { title: f.title });
    case 'undoError':
      return t('mscan.shelf.feedback.undoError', { title: f.title });
    case 'error':
      return t('mscan.shelf.feedback.error', { isbn: f.title });
  }
}

export interface SessionFeedbackProps {
  feedback: Feedback | null;
  shelves: ShelfOut[];
  busy: boolean;
  onRetry: () => void;
}

/** The short answer to the last reading; a failed one offers "retry" for that code. */
export function SessionFeedback({ feedback, shelves, busy, onRetry }: SessionFeedbackProps) {
  const t = useT();
  if (!feedback && busy) {
    return (
      <p className={styles.feedback} role="status">
        {t('mscan.sheet.looking')}
      </p>
    );
  }
  if (!feedback) return <p className={styles.feedback}>{t('mscan.shelf.feedback.idle')}</p>;
  const failed = feedback.kind === 'error';
  return (
    <div className={failed ? styles.feedbackError : styles.feedback} role={failed ? 'alert' : 'status'}>
      <span>{lineOf(t, feedback, shelves)}</span>
      {failed ? (
        <Button variant="secondary" onClick={onRetry}>
          {t('mscan.shelf.feedback.retry')}
        </Button>
      ) : null}
    </div>
  );
}
