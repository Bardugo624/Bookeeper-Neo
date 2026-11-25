import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { BookList, BookOut, ShelfBook, ShelfBookList, ShelfList, ShelfOut } from '@bookeeper/api';
import { useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { useClient } from '../../session';
import { applyMoves, asShelfBook, inRow, isSamePlace, planPlacement, type Move } from './model';
import { useKeys } from './useShelves';

interface PlaceInput {
  shelf: ShelfOut;
  /** Every book of the shelf as currently listed. */
  books: ShelfBook[];
  bookId: string;
  /** Row the book goes to, and its position among the row's other books. */
  rowIndex: number;
  index: number;
}

interface Prepared extends PlaceInput {
  shifts: Move[];
  slot: number;
  /**
   * The moved book leaves its row while the row is rearranged (a full row being reordered): it is
   * taken off the shelf, then placed again with the spine width it had.
   */
  park?: ShelfBook;
  /** The book as an unplaced one, when it is not on this shelf yet. */
  fresh?: BookOut;
}

type Snapshot = Array<[QueryKey, unknown]>;

class RowFull extends Error {}

/** Placing and unplacing books, with the order updated at once and put back when the core refuses. */
export function usePlacement() {
  const client = useClient();
  const keys = useKeys();
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();

  const fail = (e: unknown) =>
    toast.show({
      title: t('shelves.toast.failed'),
      description: e instanceof RowFull ? t('shelves.toast.rowFull') : apiErrorMessage(t, e, { slot_taken: t('shelves.toast.slotTaken') }),
      tone: 'danger',
    });

  const settle = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.shelves }),
      qc.invalidateQueries({ queryKey: ['books'] }),
      qc.invalidateQueries({ queryKey: ['stats'] }),
    ]);

  const place = useMutation<unknown, unknown, Prepared, Snapshot>({
    mutationFn: async (p) => {
      const put = (bookId: string, row: number, slot: number, spine?: number | null) =>
        client.placeBook(bookId, { shelf_id: p.shelf.id, row_index: row, slot_index: slot, ...(spine ? { spine_width: spine } : {}) });
      // Each step that went through, as the write that puts it back.
      const undo: Array<() => Promise<unknown>> = [];
      try {
        const park = p.park;
        if (park) {
          await client.unplaceBook(p.bookId);
          undo.push(() => put(p.bookId, park.row_index, park.slot_index, park.spine_width));
        }
        for (const m of p.shifts) {
          const from = p.books.find((b) => b.book_id === m.bookId)!;
          await put(m.bookId, p.rowIndex, m.slot);
          undo.push(() => put(m.bookId, from.row_index, from.slot_index));
        }
        return await put(p.bookId, p.rowIndex, p.slot, park?.spine_width);
      } catch (e) {
        // Leave the shelf as the user saw it before the move, as far as the core allows.
        for (const step of undo.reverse()) await step().catch(() => undefined);
        throw e;
      }
    },
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: keys.shelves });
      const before: Snapshot = [
        ...qc.getQueriesData({ queryKey: keys.unshelved }),
        ...qc.getQueriesData({ queryKey: keys.books(p.shelf.id) }),
        ...qc.getQueriesData({ queryKey: keys.list }),
      ];
      const moves = [...p.shifts, { bookId: p.bookId, slot: p.slot }];
      qc.setQueryData<ShelfBookList>(keys.books(p.shelf.id), (cur) => {
        if (!cur) return cur;
        const known = cur.items.some((b) => b.book_id === p.bookId);
        const items = known || !p.fresh ? cur.items : [...cur.items, asShelfBook(p.fresh, p.rowIndex, p.slot)];
        return { items: applyMoves(items, p.rowIndex, moves) };
      });
      if (p.fresh) {
        qc.setQueriesData<BookList>({ queryKey: keys.unshelved }, (cur) =>
          cur && { ...cur, items: cur.items.filter((b) => b.id !== p.bookId), total: Math.max(0, cur.total - 1) },
        );
        qc.setQueryData<ShelfList>(keys.list, (cur) =>
          cur && { items: cur.items.map((s) => (s.id === p.shelf.id ? { ...s, book_count: s.book_count + 1 } : s)) },
        );
      }
      return before;
    },
    onError: (e, _p, before) => {
      for (const [key, data] of before ?? []) qc.setQueryData(key, data);
      fail(e);
    },
    onSettled: settle,
  });

  const unplace = useMutation({
    mutationFn: (bookId: string) => client.unplaceBook(bookId),
    onError: fail,
    onSettled: settle,
  });

  /**
   * Puts a book at `index` of a row. `fresh` is the book when it comes from the unplaced list.
   * Resolves to false when nothing was sent.
   */
  const placeAt = async (input: PlaceInput, fresh?: BookOut): Promise<boolean> => {
    const row = inRow(input.books, input.rowIndex);
    if (isSamePlace(row, input.bookId, input.index)) return false;
    const plan = planPlacement(row, input.bookId, input.index, input.shelf.slots_per_row);
    if (!plan) {
      fail(new RowFull());
      return false;
    }
    const park = plan.park ? row.find((b) => b.book_id === input.bookId) : undefined;
    try {
      await place.mutateAsync({ shifts: plan.shifts, slot: plan.slot, park, ...input, fresh });
      return true;
    } catch {
      // Already reported and rolled back in `onError`.
      return false;
    }
  };

  return {
    placeAt,
    unplace: (bookId: string) => unplace.mutateAsync(bookId).then(() => true, () => false),
    busy: place.isPending || unplace.isPending,
  };
}
