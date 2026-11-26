import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BookOut, ShelfBook, ShelfOut } from '@bookeeper/api';
import { useClient } from '../../session';
import { useKeys } from './useShelves';

export type WhereState =
  | { kind: 'here'; bookId: string; title: string; row_index: number; slot_index: number }
  | { kind: 'unplaced'; book: BookOut }
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
): WhereState {
  const client = useClient();
  const keys = useKeys();
  const here = onUnit?.find((b) => b.book_id === bookId);
  // Only asked for when the open unit does not hold the book.
  const away = useQuery({
    queryKey: [...keys.shelves, 'where', bookId],
    enabled: Boolean(bookId) && onUnit !== undefined && !here,
    retry: false,
    queryFn: () => client.getBook(bookId),
  });
  const placement = away.data?.placement ?? null;
  const elsewhere = placement && shelf && placement.shelf_id !== shelf.id ? placement.shelf_id : null;
  const go = useRef(moveTo);
  go.current = moveTo;
  useEffect(() => {
    if (elsewhere) go.current(elsewhere);
  }, [elsewhere]);

  if (!bookId) return null;
  if (here) return { kind: 'here', bookId, title: here.title, row_index: here.row_index, slot_index: here.slot_index };
  if (away.data && !placement) return { kind: 'unplaced', book: away.data };
  return null;
}
