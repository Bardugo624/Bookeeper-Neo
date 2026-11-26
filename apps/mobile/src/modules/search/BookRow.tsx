import { Link } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { Tag } from '@bookeeper/ui/base';
import { BookCover } from '@bookeeper/ui/book';
import { useT } from '../../app/i18n';
import { ReadingBadge } from '../reading';
import { detailPath, type FromList } from './searchState';
import { mayHaveCover, useCover } from './useCover';
import styles from './BookRow.module.css';

export interface BookRowProps {
  book: BookOut;
  /** `?…` of the list, kept for the way back. */
  from: string;
}

export function BookRow({ book, from }: BookRowProps) {
  const t = useT();
  const src = useCover(book.id, mayHaveCover(book.cover_color));
  const author = book.authors.join(', ');
  const state: FromList = { list: from };
  return (
    <li className={styles.item}>
      <Link
        to={detailPath(book.id)}
        state={state}
        className={styles.row}
      >
        <BookCover title={book.title} src={src} color={book.cover_color ?? undefined} width={56} />
        <span className={styles.text}>
          {/* No aria-label: the name is the visible text (WCAG 2.5.3); title and author are separate spans, read with a space between. */}
          <span className={styles.title}>{book.title}</span>
          {/* With no author the line is kept, empty, so the row is as tall as the others at any text size. */}
          <span className={styles.author} aria-hidden={author ? undefined : true}>
            {author || '\u00a0'}
          </span>
        </span>
        {book.on_loan ? (
          <Tag tone="warn" className={styles.loan}>
            {t('msearch.list.onLoan')}
          </Tag>
        ) : null}
        <ReadingBadge reading={book.reading} pageCount={book.page_count} />
      </Link>
    </li>
  );
}
