import type { BookOut } from '@bookeeper/api';
import { Button, Icon, Input, Skeleton } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { UnshelvedRow } from './UnshelvedRow';
import styles from './UnshelvedList.module.css';

export interface UnshelvedListProps {
  items: BookOut[] | undefined;
  total: number | undefined;
  loading: boolean;
  failed: boolean;
  q: string;
  onQ: (q: string) => void;
  onRetry: () => void;
  /** Opens the "place in…" dialog; null without write permission. */
  onPlace: ((book: BookOut) => void) | null;
}

/** The books with no placement, with a search and a count. Rows can be dragged onto the cabinet. */
export function UnshelvedList({ items, total, loading, failed, q, onQ, onRetry, onPlace }: UnshelvedListProps) {
  const t = useT();
  let body;
  if (loading) {
    body = (
      <div role="status" aria-label={t('shelves.unshelved.loading')} className={styles.skeletons}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={44} />
        ))}
      </div>
    );
  } else if (failed) {
    body = (
      <div className={styles.note} role="alert">
        <p>{t('shelves.unshelved.error')}</p>
        <Button size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      </div>
    );
  } else if (!items || items.length === 0) {
    body = <p className={styles.note}>{q.trim() ? t('shelves.unshelved.noMatch') : t('shelves.unshelved.none')}</p>;
  } else {
    body = (
      <ul className={styles.list} aria-label={t('shelves.unshelved.title')}>
        {items.map((book) => (
          <UnshelvedRow key={book.id} book={book} onPlace={onPlace ? () => onPlace(book) : null} />
        ))}
      </ul>
    );
  }
  return (
    <section className={styles.section} aria-labelledby="unshelved-title">
      <h3 id="unshelved-title" className={styles.heading}>
        {t('shelves.unshelved.title')}
        {total !== undefined ? <span className={styles.count}>{total}</span> : null}
      </h3>
      <div className={styles.search}>
        <Icon name="search" size={15} />
        <Input
          type="search"
          value={q}
          onChange={(e) => onQ(e.target.value)}
          aria-label={t('shelves.unshelved.search')}
          placeholder={t('shelves.unshelved.search')}
          autoComplete="off"
        />
      </div>
      {onPlace && items && items.length > 0 ? <p className={styles.hint}>{t('shelves.unshelved.dragHint')}</p> : null}
      {body}
    </section>
  );
}
