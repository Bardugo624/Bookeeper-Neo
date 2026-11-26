import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { ApiError, type BookList, type BookOut, type ShelfBook, type ShelfBookList, type ShelfOut } from '@bookeeper/api';
import { useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { useClient } from '../../session';
import { useKeys } from './useShelves';

type Snapshot = Array<[QueryKey, unknown]>;

export interface WidthInput {
  shelf: ShelfOut;
  book: ShelfBook;
  /** 1..3, or null for "from the pages". */
  width: number | null;
}

/** Moving a book to another cabinet and choosing its spine width, with the view updated at once. */
export function useMoveWrites() {
  const client = useClient();
  const keys = useKeys();
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();

  const fail = (e: unknown, text?: string) =>
    toast.show({
      title: t('shelves.toast.failed'),
      description: text ?? apiErrorMessage(t, e, { slot_taken: t('shelves.toast.slotTaken'), row_full: t('shelves.toast.rowFull') }),
      tone: 'danger',
    });

  const settle = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.shelves }),
      qc.invalidateQueries({ queryKey: ['books'] }),
      qc.invalidateQueries({ queryKey: ['stats'] }),
    ]);

  const restore = (before: Snapshot) => {
    for (const [key, data] of before) qc.setQueryData(key, data);
  };

  /** True when some cabinet's list in the cache holds the book (it comes from another cabinet). */
  const isPlaced = (bookId: string) =>
    qc
      .getQueriesData<ShelfBookList>({ queryKey: [...keys.shelves, 'books'] })
      .some(([, data]) => data?.items.some((b) => b.book_id === bookId));

  /**
   * Puts the book on the first shelf of a cabinet that has a free place: one request per shelf,
   * until one does not answer `row_full`. Resolves to false when nothing was placed.
   */
  const placeFirstFree = async (bookId: string, shelf: ShelfOut, fresh?: BookOut): Promise<boolean> => {
    const before: Snapshot = qc.getQueriesData({ queryKey: keys.unshelved });
    if (fresh) {
      qc.setQueriesData<BookList>({ queryKey: keys.unshelved }, (cur) =>
        cur && { ...cur, items: cur.items.filter((b) => b.id !== bookId), total: Math.max(0, cur.total - 1) },
      );
    }
    try {
      for (let row = 0; row < shelf.rows; row++) {
        try {
          await client.placeBook(bookId, { shelf_id: shelf.id, row_index: row });
          return true;
        } catch (e) {
          if (!(e instanceof ApiError && e.code === 'row_full')) throw e;
        }
      }
      restore(before);
      fail(null, t('shelves.toast.unitFull'));
      return false;
    } catch (e) {
      restore(before);
      fail(e);
      return false;
    } finally {
      await settle();
    }
  };

  const width = useMutation<unknown, unknown, WidthInput, Snapshot>({
    mutationFn: ({ shelf, book, width: w }) =>
      client.placeBook(book.book_id, { shelf_id: shelf.id, row_index: book.row_index, slot_index: book.slot_index, spine_width: w }),
    onMutate: async ({ shelf, book, width: w }) => {
      await qc.cancelQueries({ queryKey: keys.books(shelf.id) });
      const before: Snapshot = qc.getQueriesData({ queryKey: keys.books(shelf.id) });
      qc.setQueryData<ShelfBookList>(keys.books(shelf.id), (cur) =>
        cur && { items: cur.items.map((b) => (b.book_id === book.book_id ? { ...b, spine_width: w } : b)) },
      );
      return before;
    },
    onError: (e, _input, before) => {
      restore(before ?? []);
      fail(e);
    },
    onSettled: settle,
  });

  return {
    placeFirstFree,
    isPlaced,
    setWidth: (input: WidthInput) => width.mutateAsync(input).then(() => true, () => false),
  };
}
