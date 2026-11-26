import type { BookOut } from '@bookeeper/api';
import { Link, useLocation } from 'react-router';
import { Icon, Tag } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { LoanActions } from '../loans';
import { useShelfNames } from './useBook';
import styles from './Blocks.module.css';

/** "Where is it?": the answer a phone is opened for, so it comes first and stands out. */
export function WhereBlock({ book }: { book: BookOut }) {
  const t = useT();
  const location = useLocation();
  const placement = book.placement ?? null;
  const shelves = useShelfNames(placement !== null);
  const name = placement ? shelves.get(placement.shelf_id) : undefined;
  return (
    <section className={`${styles.block} ${styles.where}`} aria-labelledby="where-title">
      <h2 id="where-title" className={styles.heading}>
        <Icon name="pin" size={16} />
        {t('msearch.detail.where.title')}
      </h2>
      {placement ? (
        <>
          <p className={styles.big}>
            {t('msearch.detail.where.phrase', {
              shelf: name ?? t('msearch.detail.where.shelf'),
              row: placement.row_index + 1,
              slot: placement.slot_index + 1,
            })}
          </p>
          <Link to={`/books/${encodeURIComponent(book.id)}/where`} state={location.state} className={styles.whereButton}>
            {t('msearch.detail.where.button')}
          </Link>
        </>
      ) : (
        <p className={styles.big}>{t('msearch.detail.where.none')}</p>
      )}
    </section>
  );
}

export function LoanBlock({ book }: { book: BookOut }) {
  const t = useT();
  return (
    <section className={`${styles.block} ${styles.loan}`} aria-labelledby="loan-title">
      <h2 id="loan-title" className={styles.heading}>
        <Icon name="loans" size={16} />
        {t('msearch.detail.loan.title')}
      </h2>
      {book.on_loan ? (
        <Tag tone="warn">{t('msearch.detail.loan.on')}</Tag>
      ) : (
        <p className={styles.plain}>{t('msearch.detail.loan.none')}</p>
      )}
      <LoanActions book={book} />
    </section>
  );
}
