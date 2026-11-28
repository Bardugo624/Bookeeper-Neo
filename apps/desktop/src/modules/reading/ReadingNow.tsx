import { useId } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { BookOut } from '@bookeeper/api';
import { BookCover, FillBar } from '@bookeeper/ui/book';
import { useT } from '../../app';
import { useClient, useSession } from '../../session';
import { authorsOf, readPath } from '../books/format';
import { mayHaveCover, useCover } from '../books/useCover';
import { ringPercent } from './readingModel';
import styles from './ReadingNow.module.css';

/** Cards shown; the rest is one click away behind «Tutti». */
export const NOW_MAX = 4;
/** Books fetched to pick from: the core has no «last opened» order, so the newest changes win among these. */
const FETCH = 200;

/** The books being read that have a file, most recently changed first. */
function useReadingNow() {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  return useQuery({
    queryKey: ['books', connectionId, 'reading-now'],
    retry: false,
    queryFn: () => client.listBooks({ reading: 'reading', limit: FETCH }),
    select: (page) =>
      page.items
        .filter((b) => b.reading?.status === 'reading' && b.file_formats.length > 0)
        .sort((a, b) => b.updated_at - a.updated_at),
  });
}

function NowCard({ book }: { book: BookOut }) {
  const t = useT();
  const src = useCover(book.id, mayHaveCover(book.cover_color));
  const author = authorsOf(book);
  const percent = book.reading ? (ringPercent(book.reading, book.page_count) ?? 0) : 0;
  return (
    <li className={styles.item}>
      <Link to={readPath(book.id)} className={styles.card}>
        <BookCover title={book.title} src={src} color={book.cover_color ?? undefined} width={52} />
        <span className={styles.text}>
          <span className={styles.title}>{book.title}</span>
          {author ? <span className={styles.author}>{author}</span> : null}
          <span className={styles.progress}>
            <FillBar value={percent / 100} tone="ok" label={t('reading.now.progress', { title: book.title })} />
            <span className={styles.percent}>{percent}%</span>
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * «In lettura»: a row above the library with the books being read, to pick up where one left off.
 * The page draws it only with no search and no filter.
 */
export function ReadingNow({ onAll }: { onAll: () => void }) {
  const t = useT();
  const headingId = useId();
  const { data } = useReadingNow();
  if (!data || data.length === 0) return null;
  return (
    <section className={styles.now} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h2 id={headingId} className={styles.heading}>
          {t('reading.now.title')}
        </h2>
        <button type="button" className={styles.all} onClick={onAll}>
          {t('reading.now.all', { count: data.length })}
        </button>
      </div>
      <ul className={styles.row}>
        {data.slice(0, NOW_MAX).map((b) => (
          <NowCard key={b.id} book={b} />
        ))}
      </ul>
    </section>
  );
}
