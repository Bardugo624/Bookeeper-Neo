import type { BookOut } from '@bookeeper/api';
import { Skeleton, Spinner } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { BookRow } from './BookRow';
import { useEndReached } from './useBookSearch';
import styles from './ResultList.module.css';

export function ResultSkeletons() {
  const t = useT();
  return (
    <div role="status" aria-label={t('mobile.loading')} className={styles.skeletons}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={styles.skeletonRow}>
          <Skeleton width={56} height={84} />
          <div className={styles.skeletonText}>
            <Skeleton shape="line" width="70%" />
            <Skeleton shape="line" width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface ResultListProps {
  items: BookOut[];
  from: string;
  busy: boolean;
  hasNext: boolean;
  fetchingNext: boolean;
  onEnd: () => void;
}

/** One column of books; the next page is asked for when the end comes into view. */
export function ResultList({ items, from, busy, hasNext, fetchingNext, onEnd }: ResultListProps) {
  const t = useT();
  const endRef = useEndReached(onEnd, hasNext && !fetchingNext, items.length);
  return (
    <>
      <ul className={styles.list} aria-label={t('msearch.list.label')} aria-busy={busy}>
        {items.map((book) => (
          <BookRow key={book.id} book={book} from={from} />
        ))}
      </ul>
      <div ref={endRef} className={styles.end}>
        {fetchingNext ? <Spinner label={t('msearch.list.loadingMore')} /> : null}
      </div>
    </>
  );
}
