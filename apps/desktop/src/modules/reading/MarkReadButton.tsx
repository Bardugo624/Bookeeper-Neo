import type { BookOut } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { useToast } from '@bookeeper/ui/overlays';
import { useLocale, useT } from '../../app';
import { apiErrorMessage, formatDate } from '../../kit';
import { statusBody } from './readingModel';
import { useReading, useSetReading } from './useReading';
import styles from './ReadingCard.module.css';

/** Under the cover: moves the book to "read"; once read it is a line with the date, not a button. */
export function MarkReadButton({ book }: { book: BookOut }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { data: reading, isPending, isError } = useReading(book.id);
  const set = useSetReading(book.id, book.page_count);
  // Without the state at hand a tap would write over the rating and the note.
  if (isPending || isError) return null;
  if (reading?.status === 'read') {
    const at = reading.finished_at ?? reading.updated_at;
    return <p className={styles.readOn}>{t('reading.markRead.doneOn', { date: formatDate(locale, at) })}</p>;
  }
  return (
    <Button
      icon="check"
      onClick={() =>
        set.mutate(statusBody(reading ?? null, 'read'), {
          onError: (error) => toast.show({ title: apiErrorMessage(t, error), tone: 'danger' }),
        })
      }
    >
      {t('reading.markRead.button')}
    </Button>
  );
}
