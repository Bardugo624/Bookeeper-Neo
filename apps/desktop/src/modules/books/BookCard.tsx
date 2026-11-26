import { Link } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { Icon, Tag } from '@bookeeper/ui/base';
import { BookCover } from '@bookeeper/ui/book';
import { useT } from '../../app';
import { ReadingRing } from '../reading';
import { authorsOf, detailPath, type FromList } from './format';
import { WhereLink } from './WhereLink';
import { SelectionCheckbox } from './SelectionCheckbox';
import { mayHaveCover, useCover } from './useCover';
import type { Selection } from './useSelection';
import styles from './BookCard.module.css';

export interface BookCardProps {
  book: BookOut;
  /** Address of the list (`?…`), kept for the way back. */
  from: string;
  /** Present while the list is in selection mode. */
  selection?: Selection;
  /** Position in the list, and, in a windowed grid, the cell (1-based) the card is placed in. */
  index?: number;
  cell?: { row: number; column: number };
}

export function BookCard({ book, from, selection, index, cell }: BookCardProps) {
  const t = useT();
  const src = useCover(book.id, mayHaveCover(book.cover_color));
  const author = authorsOf(book);
  // The name starts with the visible text, in reading order: title, author, then the "On loan" label.
  const base = author ? t('books.list.cardName', { title: book.title, author }) : book.title;
  const name = book.on_loan ? t('books.list.cardNameLoan', { name: base, loan: t('books.list.onLoan') }) : base;
  const state: FromList = { list: from };
  return (
    <li className={styles.item} data-index={index} style={cell ? { gridRow: cell.row, gridColumn: cell.column } : undefined}>
      {selection ? (
        <SelectionCheckbox
          label={t('books.selection.select', { title: book.title })}
          checked={selection.selected.has(book.id)}
          onToggle={(range) => selection.toggle(book.id, range)}
          className={styles.check}
        />
      ) : null}
      <WhereLink book={book} className={styles.where} />
      <Link to={detailPath(book.id)} state={state} aria-label={name} className={styles.card}>
        <BookCover title={book.title} author={author || undefined} src={src} color={book.cover_color ?? undefined} lift>
          {book.on_loan ? (
            <Tag tone="warn" className={styles.loan}>
              {t('books.list.onLoan')}
            </Tag>
          ) : null}
          {book.reading?.status === 'reading' ? (
            <span className={styles.ring}>
              <ReadingRing reading={book.reading} pageCount={book.page_count} size={30} />
            </span>
          ) : null}
          {book.reading?.status === 'read' ? (
            <span className={styles.done} role="img" aria-label={t('reading.status.read')}>
              <Icon name="check" size={12} />
            </span>
          ) : null}
        </BookCover>
        <span className={styles.title}>{book.title}</span>
        {author ? <span className={styles.author}>{author}</span> : null}
      </Link>
    </li>
  );
}
