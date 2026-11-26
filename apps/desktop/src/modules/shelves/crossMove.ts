import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { ShelfBook, ShelfBookList } from '@bookeeper/api';

/**
 * Takes a book out of the cached lists of every cabinet but `keep`, and gives back the copy it was
 * listed as (so a move to another cabinet shows at once). The lists are changed in the cache only.
 */
export function takeFromOthers(qc: QueryClient, prefix: QueryKey, keep: QueryKey, bookId: string): ShelfBook | undefined {
  let found: ShelfBook | undefined;
  const same = (a: QueryKey, b: QueryKey) => JSON.stringify(a) === JSON.stringify(b);
  for (const [key, data] of qc.getQueriesData<ShelfBookList>({ queryKey: prefix })) {
    if (same(key, keep) || !data) continue;
    const hit = data.items.find((b) => b.book_id === bookId);
    if (!hit) continue;
    found = hit;
    qc.setQueryData<ShelfBookList>(key, { items: data.items.filter((b) => b.book_id !== bookId) });
  }
  return found;
}

/** The first row of a shelf with a place left after its last book, as the core would pick it. */
export function firstFreeSpot(items: ShelfBook[], rows: number, slotsPerRow: number): { row: number; slot: number } | undefined {
  for (let row = 0; row < rows; row++) {
    const last = items.filter((b) => b.row_index === row).reduce((m, b) => Math.max(m, b.slot_index), -1);
    if (last + 1 < slotsPerRow) return { row, slot: last + 1 };
  }
  return undefined;
}
