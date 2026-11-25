import type { ReactNode } from 'react';
import type { ShelfOut } from '@bookeeper/api';
import { IconButton } from '@bookeeper/ui/base';
import { FillBar } from '@bookeeper/ui/book';
import { useT } from '../../app';
import { freeSlots } from './model';
import styles from './ShelfPanel.module.css';

export interface ShelfPanelProps {
  shelf: ShelfOut;
  /** Edit and delete handlers; null without write permission. */
  onEdit: (() => void) | null;
  onDelete: (() => void) | null;
  /** The list of unplaced books. */
  children: ReactNode;
}

/** Side panel: the unit's name, how full it is, and the unplaced books. */
export function ShelfPanel({ shelf, onEdit, onDelete, children }: ShelfPanelProps) {
  const t = useT();
  const free = freeSlots(shelf);
  const value = shelf.capacity > 0 ? shelf.book_count / shelf.capacity : 0;
  return (
    <aside className={styles.panel} aria-label={t('shelves.panel.label', { name: shelf.name })}>
      <div className={styles.head}>
        <h2 className={styles.name}>{shelf.name}</h2>
        {onEdit ? <IconButton icon="pencil" size="sm" label={t('shelves.panel.edit', { name: shelf.name })} onClick={onEdit} /> : null}
        {onDelete ? <IconButton icon="trash" size="sm" label={t('shelves.panel.delete', { name: shelf.name })} onClick={onDelete} /> : null}
      </div>
      <p className={styles.layout}>{t('shelves.panel.layout', { rows: shelf.rows, slots: shelf.slots_per_row })}</p>
      {free !== null ? <FillBar tone="auto" value={value} label={t('shelves.panel.fill', { name: shelf.name })} /> : null}
      <p className={styles.fill}>
        {free !== null
          ? t('shelves.panel.booksFree', {
              books: t('shelves.panel.books', { count: shelf.book_count }),
              free: t('shelves.panel.free', { count: free }),
            })
          : t('shelves.panel.books', { count: shelf.book_count })}
      </p>
      {children}
    </aside>
  );
}
