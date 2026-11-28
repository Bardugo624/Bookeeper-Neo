import { useNavigate } from 'react-router';
import type { BookOut, ReadingOut } from '@bookeeper/api';
import { Button, Icon, Skeleton } from '@bookeeper/ui/base';
import { useLocale, useT } from '../../app';
import { formatDate, usePermission } from '../../kit';
import { NoteField } from './NoteField';
import { PageField } from './PageField';
import { ReadingRing } from './ReadingRing';
import { ReadingStatusMenu } from './ReadingStatusMenu';
import { StarRating } from './StarRating';
import { fieldError } from './fieldError';
import { bodyFrom, isStatus, ringPercent } from './readingModel';
import { tourAnchor } from '../tour';
import { useReading, useSetReading } from './useReading';
import styles from './ReadingCard.module.css';

/** No state yet: an invitation with the two ways in. */
function Invitation({ book }: { book: BookOut }) {
  const t = useT();
  const set = useSetReading(book.id, book.page_count);
  const error = fieldError(t, set.error);
  return (
    <>
      <p className={styles.invite}>{t('reading.card.invite')}</p>
      <div className={styles.actions}>
        <Button size="sm" onClick={() => set.mutate(bodyFrom(null, { status: 'to_read' }))}>
          {t('reading.card.toRead')}
        </Button>
        <Button size="sm" variant="primary" onClick={() => set.mutate(bodyFrom(null, { status: 'reading' }))}>
          {t('reading.card.start')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </>
  );
}

function Progress({ reading, book }: { reading: ReadingOut; book: BookOut }) {
  const t = useT();
  const locale = useLocale();
  const status = isStatus(reading.status) ? t(`reading.status.${reading.status}`) : reading.status;
  const total = book.page_count;
  let page = null;
  if (reading.current_page != null && reading.status !== 'to_read') {
    page = total
      ? t('reading.card.pageOf', { page: reading.current_page, total })
      : t('reading.card.page', { page: reading.current_page });
  }
  return (
    <div className={styles.summary}>
      <ReadingRing reading={reading} pageCount={total} size={60} />
      <div className={styles.facts}>
        <p className={styles.status}>{status}</p>
        {page ? <p className={styles.note}>{page}</p> : null}
        {reading.started_at != null ? (
          <p className={styles.note}>{t('reading.card.startedOn', { date: formatDate(locale, reading.started_at) })}</p>
        ) : null}
      </div>
    </div>
  );
}

/** «Continua · 45%»: back to the e-book of a book that is being read. */
function Continue({ reading, book }: { reading: ReadingOut; book: BookOut }) {
  const t = useT();
  const navigate = useNavigate();
  const percent = ringPercent(reading, book.page_count);
  return (
    <Button size="sm" variant="primary" icon="book" onClick={() => void navigate(`/read/${encodeURIComponent(book.id)}`)}>
      {percent ? t('reading.card.continuePercent', { percent }) : t('reading.card.continue')}
    </Button>
  );
}

/** "Reading" card of the book page: the caller's own state, whatever their role. */
export function ReadingCard({ book }: { book: BookOut }) {
  const t = useT();
  const canRead = usePermission().can('write');
  const { data: reading, isPending, isError, refetch } = useReading(book.id);
  let body;
  if (isPending) {
    body = (
      <div role="status" aria-label={t('reading.card.loading')}>
        <Skeleton shape="line" width="100%" height={60} />
      </div>
    );
  } else if (isError) {
    body = (
      <>
        <p className={styles.note}>{t('reading.card.error')}</p>
        <Button size="sm" onClick={() => void refetch()}>
          {t('reading.card.retry')}
        </Button>
      </>
    );
  } else if (!reading) {
    body = <Invitation book={book} />;
  } else {
    body = (
      <>
        <Progress reading={reading} book={book} />
        <div className={styles.actions}>
          {reading.status === 'reading' && book.file_formats.length > 0 && canRead ? <Continue reading={reading} book={book} /> : null}
          <ReadingStatusMenu bookId={book.id} reading={reading} />
        </div>
        {reading.status === 'reading' ? <PageField reading={reading} pageCount={book.page_count} /> : null}
        <StarRating reading={reading} />
        <NoteField reading={reading} />
      </>
    );
  }
  return (
    <section className={styles.card} aria-labelledby={`reading-${book.id}`} {...tourAnchor('book.reading')}>
      <h2 id={`reading-${book.id}`} className={styles.heading}>
        <Icon name="book" size={14} />
        {t('reading.card.title')}
      </h2>
      {body}
    </section>
  );
}
