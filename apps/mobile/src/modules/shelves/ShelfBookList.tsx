import { useMemo } from 'react';
import type { ShelfBook } from '@bookeeper/api';
import { useT } from '../../app/i18n';
import { ListRow } from '../../kit';
import styles from './Shelves.module.css';

/** The books of a piece of furniture, shelf by shelf: the full-size control the narrow spines cannot be (WCAG 2.5.8). */
export function ShelfBookList({ books }: { books: ShelfBook[] }) {
  const t = useT();
  const rows = useMemo(() => {
    const byRow = new Map<number, ShelfBook[]>();
    for (const b of books) byRow.set(b.row_index, [...(byRow.get(b.row_index) ?? []), b]);
    return [...byRow.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, list]) => ({ index, list: [...list].sort((a, b) => a.slot_index - b.slot_index) }));
  }, [books]);
  return (
    <section className={styles.room} aria-label={t('mshelves.byRow')}>
      {rows.map((r) => (
        <div key={r.index} className={styles.room}>
          <h3 className={styles.roomName}>{t('mshelves.row', { row: r.index + 1 })}</h3>
          <ul className={styles.list}>
            {r.list.map((b) => (
              <li key={b.book_id}>
                <ListRow to={`/books/${encodeURIComponent(b.book_id)}`} title={b.title} subtitle={b.authors.join(', ') || undefined} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
