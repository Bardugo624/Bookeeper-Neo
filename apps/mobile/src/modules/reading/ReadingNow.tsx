import { useId } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { BookOut } from '@bookeeper/api';
import { BookCover, FillBar } from '@bookeeper/ui/book';
import { useT } from '../../app/i18n';
import { useClient, useSession } from '../../session';
import { canSeeFiles } from '../search/filesModel';
import { mayHaveCover, useCover } from '../search/useCover';
import { ringPercent } from './readingModel';
import styles from './ReadingNow.module.css';

/** Covers in the row; the rest is one tap away behind «Tutti». */
export const NOW_MAX = 12;
/** Books per page, and pages at most, when looking for the books being read. */
const PAGE = 200;
const MAX_PAGES = 5;

/**
 * The books being read that have a file, most recently read first (the order of the caller's own
 * reading states, not of the book's metadata). `total` counts every book «In lettura», as the filter lists them.
 */
function useReadingNow(enabled: boolean) {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({
    queryKey: ['books', libraryId, 'reading-now'],
    enabled,
    retry: false,
    queryFn: async () => {
      const [states, first] = await Promise.all([
        client.listReading({ status: 'reading', limit: PAGE }),
        client.listBooks({ reading: 'reading', limit: PAGE }),
      ]);
      const books = [...first.items];
      for (let page = 1; page < MAX_PAGES && books.length < first.total; page += 1) {
        const next = await client.listBooks({ reading: 'reading', limit: PAGE, offset: page * PAGE });
        if (next.items.length === 0) break;
        books.push(...next.items);
      }
      const rank = new Map(states.items.map((s, i) => [s.book.id, i]));
      const at = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
      const items = books
        .filter((b) => b.reading?.status === 'reading' && b.file_formats.length > 0)
        .sort((a, b) => at(a.id) - at(b.id));
      return { items, total: first.total };
    },
  });
}

function NowCard({ book }: { book: BookOut }) {
  const t = useT();
  const src = useCover(book.id, mayHaveCover(book.cover_color));
  const percent = book.reading ? (ringPercent(book.reading, book.page_count) ?? 0) : 0;
  return (
    <li className={styles.item}>
      <Link to={`/read/${encodeURIComponent(book.id)}`} className={styles.card}>
        <BookCover title={book.title} src={src} color={book.cover_color ?? undefined} width={104} />
        <span className={styles.title}>{book.title}</span>
        <span className={styles.progress}>
          <FillBar value={percent / 100} tone="ok" label={t('mreading.now.progress', { title: book.title })} />
          <span className={styles.percent}>{percent}%</span>
        </span>
      </Link>
    </li>
  );
}

/**
 * «In lettura»: a row that scrolls sideways, to pick up where one left off.
 * The search page draws it only while the field is empty and no filter is on.
 */
export function ReadingNow({ onAll }: { onAll: () => void }) {
  const t = useT();
  const headingId = useId();
  const canRead = canSeeFiles(useSession((s) => s.me?.user.role));
  const { data } = useReadingNow(canRead);
  if (!canRead || !data || data.items.length === 0) return null;
  const shown = data.items.slice(0, NOW_MAX);
  return (
    <section className={styles.now} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h2 id={headingId} className={styles.heading}>
          {t('mreading.now.title')}
        </h2>
        {data.total > shown.length ? (
          <button type="button" className={styles.all} onClick={onAll}>
            {t('mreading.now.all', { count: data.total })}
          </button>
        ) : null}
      </div>
      <ul className={styles.row}>
        {shown.map((b) => (
          <NowCard key={b.id} book={b} />
        ))}
      </ul>
    </section>
  );
}
