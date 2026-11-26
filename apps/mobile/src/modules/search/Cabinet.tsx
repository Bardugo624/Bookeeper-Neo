import { useMemo } from 'react';
import type { ShelfBook, ShelfOut } from '@bookeeper/api';
import { SHELF_COLORS, ShelfUnit, type ShelfRow, type SpineBook } from '@bookeeper/ui/shelf';
import { useT } from '../../app/i18n';
import styles from './Cabinet.module.css';

const COLOR_NAMES = ['sage', 'terracotta', 'night', 'plum', 'amber', 'graphite'];
const WIDTH_PAGES: Record<number, number> = { 1: 150, 2: 400, 3: 700 };

function spineOf(b: ShelfBook): SpineBook {
  return {
    id: b.book_id,
    title: b.title,
    author: b.authors.join(', ') || undefined,
    pages: b.spine_width ? WIDTH_PAGES[b.spine_width] : undefined,
    color: b.cover_color ?? undefined,
  };
}

function rowsOf(shelf: ShelfOut, books: ShelfBook[], label: (n: number) => string): ShelfRow[] {
  return Array.from({ length: shelf.rows }, (_, i) => ({
    id: String(i),
    label: label(i + 1),
    capacity: shelf.slots_per_row,
    books: books
      .filter((b) => b.row_index === i)
      .sort((a, b) => a.slot_index - b.slot_index)
      .map(spineOf),
  }));
}

export interface CabinetProps {
  shelf: ShelfOut;
  books: ShelfBook[];
  /** Accessible name of the whole cabinet. */
  label: string;
  /** The spine drawn pulled out ("where is it?"). */
  pulledId?: string;
  onOpenBook?: (id: string) => void;
}

/** A cabinet, read only; it scrolls inside itself when wider than the screen, the page never does. */
export function Cabinet({ shelf, books, label, pulledId, onOpenBook }: CabinetProps) {
  const t = useT();
  const rows = useMemo(() => rowsOf(shelf, books, (n) => t('msearch.detail.where.row', { row: n })), [shelf, books, t]);
  const i = COLOR_NAMES.indexOf(shelf.color);
  return (
    <div className={styles.cabinet} role="group" aria-label={label}>
      <ShelfUnit
        color={SHELF_COLORS[i < 0 ? 0 : i]!}
        rows={rows}
        pulledId={pulledId}
        readOnly
        onSpineClick={onOpenBook ? (b) => onOpenBook(String(b.id)) : undefined}
        spineLabel={(b) => ({ title: b.title, detail: b.author ?? '' })}
      />
    </div>
  );
}
