import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError, type BookOut, ShelfBook, ShelfOut } from '@bookeeper/api';
import { useClient } from '../../session';
import { useKeys } from './useShelves';

export type WhereState =
  | { kind: 'here'; bookId: string; title: string; row_index: number; slot_index: number }
  | { kind: 'unplaced'; book: BookOut }
  | { kind: 'gone' }
  | { kind: 'error'; retry: () => void }
  | null;

/**
 * Where the book named by `?book` stands, seen from the open unit: on it (its spine is pulled out), on
 * another one (the address is corrected), or nowhere. Null while it is still being worked out.
 */
export function useWhere(
  bookId: string,
  shelf: ShelfOut | undefined,
  onUnit: ShelfBook[] | undefined,
  moveTo: (unit: string) => void,
  /** True when the list is loaded and no unit is open (a filter that shows none), so the book is looked up anyway. */
  noUnit = false,
): WhereState {
  const client = useClient();
  const keys = useKeys();
  const here = onUnit?.find((b) => b.book_id === bookId);
  // Only asked for when the open unit does not hold the book.
  const away = useQuery({
    queryKey: [...keys.shelves, 'where', bookId],
    enabled: Boolean(bookId) && (onUnit !== undefined || noUnit) && !here,
    retry: false,
    queryFn: () => client.getBook(bookId),
  });
  const placement = away.data?.placement ?? null;
  const elsewhere = placement && placement.shelf_id !== shelf?.id ? placement.shelf_id : null;
  const go = useRef(moveTo);
  go.current = moveTo;
  useEffect(() => {
    if (elsewhere) go.current(elsewhere);
  }, [elsewhere]);

  if (!bookId) return null;
  if (here) return { kind: 'here', bookId, title: here.title, row_index: here.row_index, slot_index: here.slot_index };
  if (away.data && !placement) return { kind: 'unplaced', book: away.data };
  if (away.isError) {
    if (away.error instanceof ApiError && away.error.status === 404) return { kind: 'gone' };
    return { kind: 'error', retry: () => void away.refetch() };
  }
  return null;
}
