import { Link } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { Tag } from '@bookeeper/ui/base';
import { BookCover } from '@bookeeper/ui/book';
import { useT } from '../../app';
import { authorsOf, detailPath, type FromList } from './format';
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
}

export function BookCard({ book, from, selection }: BookCardProps) {
  const t = useT();
  const src = useCover(book.id, mayHaveCover(book.cover_color));
  const author = authorsOf(book);
  const name = author ? t('books.list.cardName', { title: book.title, author }) : book.title;
  const state: FromList = { list: from };
  return (
    <li className={styles.item}>
      {selection ? (
        <SelectionCheckbox
          label={t('books.selection.select', { title: book.title })}
          checked={selection.selected.has(book.id)}
          onToggle={(range) => selection.toggle(book.id, range)}
          className={styles.check}
        />
      ) : null}
      <Link to={detailPath(book.id)} state={state} aria-label={name} className={styles.card}>
        <BookCover title={book.title} author={author || undefined} src={src} color={book.cover_color ?? undefined} lift>
          {book.on_loan ? (
            <Tag tone="warn" className={styles.loan}>
              {t('books.list.onLoan')}
            </Tag>
          ) : null}
        </BookCover>
        <span className={styles.title}>{book.title}</span>
        {author ? <span className={styles.author}>{author}</span> : null}
      </Link>
    </li>
  );
}
