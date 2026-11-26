import { useId, useState } from 'react';
import type { BookOut, ReadingOut } from '@bookeeper/api';
import { Icon, Skeleton } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { apiErrorMessage } from '../../kit';
import { NoteField } from './NoteField';
import { PageField } from './PageField';
import { ReadingSummary } from './ReadingSummary';
import { StarRating } from './StarRating';
import { StatusChoices } from './StatusChoices';
import { StatusSheet } from './StatusSheet';
import { useReading } from './useReading';
import { useStatusActions } from './useStatusActions';
import styles from './Reading.module.css';

function WithState({ book, reading }: { book: BookOut; reading: ReadingOut }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const actions = useStatusActions(book, reading);
  const finished = reading.status === 'read' || reading.status === 'abandoned';
  return (
    <>
      <ReadingSummary reading={reading} book={book} />
      <button type="button" className={styles.change} onClick={() => setOpen(true)}>
        {t('mreading.change')}
      </button>
      {actions.error ? (
        <p role="alert" className={styles.error}>
          {apiErrorMessage(t, actions.error)}
        </p>
      ) : null}
      {reading.status === 'reading' ? (
        <>
          <PageField reading={reading} pageCount={book.page_count} />
          <button type="button" className={styles.primary} onClick={() => actions.choose('read')}>
            {t('mreading.markRead')}
          </button>
        </>
      ) : null}
      {finished ? (
        <>
          <StarRating reading={reading} />
          <NoteField reading={reading} />
        </>
      ) : null}
      <StatusSheet open={open} onOpenChange={setOpen} current={reading.status} onChoose={actions.choose} onClear={actions.clear} />
    </>
  );
}

/** "Reading" block of the book page: the caller's own state, whatever their role. */
export function ReadingBlock({ book }: { book: BookOut }) {
  const t = useT();
  const titleId = useId();
  const { data: reading, isPending, isError, error, refetch } = useReading(book.id);
  let body;
  if (isPending) {
    body = (
      <div role="status" aria-label={t('mreading.loading')}>
        <Skeleton shape="line" width="100%" height={64} />
      </div>
    );
  } else if (isError) {
    // No write control here: a write would replace a rating and a note that were never read.
    body = (
      <>
        <p role="alert" className={styles.plain}>
          {t('mreading.error')} {apiErrorMessage(t, error)}
        </p>
        <button type="button" className={styles.change} onClick={() => void refetch()}>
          {t('mreading.retry')}
        </button>
      </>
    );
  } else if (!reading) body = <StatusChoices book={book} />;
  else body = <WithState book={book} reading={reading} />;
  return (
    <section className={`${styles.block}`} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.heading}>
        <Icon name="book" size={16} />
        {t('mreading.title')}
      </h2>
      {body}
    </section>
  );
}
