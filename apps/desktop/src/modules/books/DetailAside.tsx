import type { BookOut } from '@bookeeper/api';
import { Icon, Tag } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { useShelfNames } from './useBook';
import styles from './DetailAside.module.css';

export function DetailAside({ book }: { book: BookOut }) {
  const t = useT();
  const shelves = useShelfNames();
  const placement = book.placement ?? null;
  const shelfName = placement ? shelves.get(placement.shelf_id) : undefined;
  return (
    <aside className={styles.aside}>
      <section className={styles.card} aria-labelledby="book-where">
        <h2 id="book-where" className={styles.heading}>
          <Icon name="pin" size={14} />
          {t('books.detail.where.title')}
        </h2>
        {placement ? (
          <>
            {shelfName ? <p className={styles.value}>{shelfName}</p> : null}
            <p className={styles.note}>{t('books.detail.where.row', { row: placement.row_index + 1 })}</p>
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
          <Tag tone="warn">{t('books.detail.loans.onLoan')}</Tag>
        ) : (
          <p className={styles.note}>{t('books.detail.loans.none')}</p>
        )}
      </section>
    </aside>
  );
}
