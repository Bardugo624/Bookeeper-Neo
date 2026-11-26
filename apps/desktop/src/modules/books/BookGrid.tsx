import type { BookOut } from '@bookeeper/api';
import { Skeleton } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { BookCard } from './BookCard';
import { useWindowedRows } from './useWindowedRows';
import type { Selection } from './useSelection';
import styles from './BookGrid.module.css';

/** Height of a card (cover, title, author) and the gap under it; the same numbers as the CSS. */
export const CARD_HEIGHT = 264;
const ROW_GAP = 28;
const COLUMN_WIDTH = 144;
const COLUMN_GAP = 24;

/** Cards per row of the `auto-fill` grid; a guess while the width is not known. */
const columnsFor = (width: number) => (width > 0 ? Math.floor((width + COLUMN_GAP) / (COLUMN_WIDTH + COLUMN_GAP)) : 6);

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
  const win = useWindowedRows<HTMLUListElement>({
    count: books.length,
    pitch: CARD_HEIGHT + ROW_GAP,
    columns: columnsFor,
  });
  // Windowed: each card sits in its own grid cell, and the list keeps the height of all its rows.
  const rows = Math.ceil(books.length / win.cols);
  const listStyle = win.windowed
    ? {
        gridAutoRows: CARD_HEIGHT,
        height: rows * CARD_HEIGHT + (rows - 1) * ROW_GAP,
      }
    : undefined;
  return (
    <>
      <ul ref={win.ref} className={styles.grid} style={listStyle} aria-label={t('books.list.label')} {...win.handlers}>
        {win.items.map(({ index }) => {
          const b = books[index]!;
          return (
            <BookCard
              key={b.id}
              book={b}
              from={from}
              selection={selection}
              index={index}
              cell={
                win.windowed
                  ? {
                      row: Math.floor(index / win.cols) + 1,
                      column: (index % win.cols) + 1,
                    }
                  : undefined
              }
            />
          );
        })}
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
