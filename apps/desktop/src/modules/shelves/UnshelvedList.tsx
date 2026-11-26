import { Fragment } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Button, Icon, Input, Skeleton } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { useWindowedRows } from '../books/useWindowedRows';
import { UnshelvedRow } from './UnshelvedRow';
import styles from './UnshelvedList.module.css';

/** Height of a row and the gap under it, as in the CSS of a windowed list. */
export const ROW_PITCH = 66;

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

function Spacer({ height }: { height: number }) {
  return <li aria-hidden="true" style={{ height }} />;
}

/** The books with no placement, with a search and a count. Rows can be dragged onto the cabinet. */
export function UnshelvedList({ items, total, loading, failed, q, onQ, onRetry, onPlace }: UnshelvedListProps) {
  const t = useT();
  const win = useWindowedRows<HTMLUListElement>({ count: items?.length ?? 0, pitch: ROW_PITCH, own: true });
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
      <ul
        ref={win.ref}
        className={win.windowed ? `${styles.list} ${styles.windowed}` : styles.list}
        aria-label={t('shelves.unshelved.title')}
        {...win.handlers}
      >
        {win.items.map(({ index, gapBefore }) => {
          const book = items[index]!;
          return (
            <Fragment key={book.id}>
              {gapBefore > 0 ? <Spacer height={gapBefore} /> : null}
              <UnshelvedRow book={book} index={index} onPlace={onPlace ? () => onPlace(book) : null} />
            </Fragment>
          );
        })}
        {win.tail > 0 ? <Spacer height={win.tail} /> : null}
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
