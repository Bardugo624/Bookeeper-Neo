import type { BookOut } from '@bookeeper/api';
import { Skeleton } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { BookCard } from './BookCard';
import type { Selection } from './useSelection';
import styles from './BookGrid.module.css';

export function BookGrid({
  books,
  from,
  loadingMore,
  selection,
}: {
  books: BookOut[];
  from: string;
  loadingMore: boolean;
  selection?: Selection;
}) {
  const t = useT();
  return (
    <>
      <ul className={styles.grid} aria-label={t('books.list.label')}>
        {books.map((b) => (
          <BookCard key={b.id} book={b} from={from} selection={selection} />
        ))}
      </ul>
      {loadingMore ? <GridSkeleton count={6} label={t('books.list.loadingMore')} /> : null}
    </>
  );
}

export function GridSkeleton({ count, label }: { count: number; label: string }) {
  return (
    <ul className={styles.grid} aria-label={label} aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={styles.skeleton}>
          <Skeleton width={144} height={216} />
          <Skeleton shape="line" width={110} />
          <Skeleton shape="line" width={70} />
        </li>
      ))}
    </ul>
  );
}
