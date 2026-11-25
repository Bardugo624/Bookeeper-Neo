import { useMemo } from 'react';
import type { ShelfBook, ShelfOut } from '@bookeeper/api';
import { ShelfUnit, type ShelfAnnounce, type SlotDrop, type SpineBook } from '@bookeeper/ui/shelf';
import { useT } from '../../app';
import { colorOf, rowsOf } from './model';
import styles from './ShelvesPage.module.css';

export interface ShelfCabinetProps {
  shelf: ShelfOut;
  books: ShelfBook[];
  selectedId?: string;
  canWrite: boolean;
  onDrop: (drop: SlotDrop) => void;
  onSpine: (book: SpineBook) => void;
}

/** The cabinet drawing with its texts; an empty one gets an invitation (or a note) under it. */
export function ShelfCabinet({ shelf, books, selectedId, canWrite, onDrop, onSpine }: ShelfCabinetProps) {
  const t = useT();
  const rows = useMemo(() => rowsOf(shelf, books, (n) => t('shelves.row', { n })), [shelf, books, t]);
  const announce = useMemo<ShelfAnnounce>(
    () => ({
      pick: (book, row) => t('shelves.announce.pick', { title: book.title, row: row.label }),
      move: (book, row, index) => t('shelves.announce.move', { title: book.title, row: row.label, position: index + 1 }),
      drop: (book, row, index) => t('shelves.announce.drop', { title: book.title, row: row.label, position: index + 1 }),
      cancel: (book) => t('shelves.announce.cancel', { title: book.title }),
    }),
    [t],
  );
  return (
    <div className={styles.cabinet}>
      <ShelfUnit
        color={colorOf(shelf.color)}
        rows={rows}
        selectedId={selectedId}
        readOnly={!canWrite}
        announce={announce}
        spineLabel={(book) => ({ title: book.title, detail: book.author ?? '' })}
        onSpineClick={onSpine}
        onSlotDrop={onDrop}
      />
      {books.length === 0 ? (
        <p className={styles.invite}>{canWrite ? t('shelves.emptyUnit.invite') : t('shelves.emptyUnit.readOnly')}</p>
      ) : null}
    </div>
  );
}
