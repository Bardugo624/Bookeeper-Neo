import type { BookOut } from '@bookeeper/api';
import { Link } from 'react-router';
import { Icon, Tag } from '@bookeeper/ui/base';
import { useLocale, useT } from '../../app';
import { formatDate } from '../../kit';
import { useActiveLoan } from '../loans';
import { ReadingCard } from '../reading';
import { wherePhrase } from '../shelves';
import { OwnerLine, ReadersBlock } from './DetailPeople';
import { DetailTags } from './DetailTags';
import { useShelfNames } from './useBook';
import styles from './DetailAside.module.css';

/** To whom and since when the book is lent. */
function LoanLine({ bookId }: { bookId: string }) {
  const t = useT();
  const locale = useLocale();
  const { loan } = useActiveLoan(bookId);
  if (!loan) return null;
  return (
    <p className={styles.note}>
      {t('books.detail.loans.to', { name: loan.borrower_name, date: formatDate(locale, loan.lent_at) })}
    </p>
  );
}

export function DetailAside({ book }: { book: BookOut }) {
  const t = useT();
  const shelves = useShelfNames();
  const placement = book.placement ?? null;
  const shelfName = placement ? shelves.get(placement.shelf_id) : undefined;
  return (
    <aside className={styles.aside}>
      <OwnerLine book={book} />
      <ReadingCard book={book} />
      <ReadersBlock bookId={book.id} />
      <DetailTags book={book} />
      <section className={styles.card} aria-labelledby="book-where">
        <h2 id="book-where" className={styles.heading}>
          <Icon name="pin" size={14} />
          {t('books.detail.where.title')}
        </h2>
        {placement ? (
          <>
            <p className={styles.value}>{wherePhrase(t, { ...placement, shelfName })}</p>
            <Link
              className={styles.link}
              to={`/shelves?unit=${encodeURIComponent(placement.shelf_id)}&book=${encodeURIComponent(book.id)}`}
            >
              {t('books.detail.where.show')}
            </Link>
          </>
        ) : (
          <p className={styles.note}>{t('books.detail.where.none')}</p>
        )}
      </section>
      <section className={styles.card} aria-labelledby="book-loans">
        <h2 id="book-loans" className={styles.heading}>
          <Icon name="loans" size={14} />
          {t('books.detail.loans.title')}
        </h2>
        {book.on_loan ? (
          <>
            <Tag tone="warn" className={styles.tag}>{t('books.detail.loans.onLoan')}</Tag>
            <LoanLine bookId={book.id} />
            <Link className={styles.link} to={`/loans?book=${encodeURIComponent(book.id)}`}>
              {t('books.detail.loans.open')}
            </Link>
          </>
        ) : (
          <p className={styles.note}>{t('books.detail.loans.none')}</p>
        )}
      </section>
    </aside>
  );
}
