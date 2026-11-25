import { useState } from 'react';
import type { BookOut, ShelfOut } from '@bookeeper/api';
import type { SlotDrop, SpineBook } from '@bookeeper/ui/shelf';
import { useT } from '../../app';
import { apiErrorMessage, stringParam, useListParams, usePermission } from '../../kit';
import { createBody, patchBody, type ShelfValues } from './formModel';
import { usePlacement } from './usePlacement';
import { useShelfBooks, useShelfList, useUnshelved } from './useShelves';
import { useDebounced } from './useDebounced';
import { useShelfWrites } from './useShelfWrites';

const PARAMS = { unit: stringParam(), book: stringParam() };

export type Dialog =
  | { kind: 'form'; shelf?: ShelfOut }
  | { kind: 'delete'; shelf: ShelfOut }
  | { kind: 'place'; book: BookOut }
  | null;

/** Everything the shelves page shows and does: the chosen unit, its books, the unplaced list and the writes. */
export function useShelvesView() {
  const t = useT();
  const { can } = usePermission();
  const canWrite = can('write');
  const params = useListParams(PARAMS);
  const list = useShelfList();
  const shelves = list.data?.items ?? [];
  const shelf = shelves.find((s) => s.id === params.values.unit) ?? shelves[0];
  const books = useShelfBooks(shelf?.id);
  const [search, setSearch] = useState('');
  const unshelved = useUnshelved(useDebounced(search));
  const placement = usePlacement();
  const writes = useShelfWrites();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [spine, setSpine] = useState<SpineBook | null>(null);
  const [error, setError] = useState<string | null>(null);

  const placed = shelves.reduce((n, s) => n + s.book_count, 0);

  const drop = (d: SlotDrop) => {
    if (!shelf || !books.data) return;
    const known = books.data.items.some((b) => b.book_id === d.bookId);
    const fresh = known ? undefined : unshelved.data?.items.find((b) => b.id === d.bookId);
    if (!known && !fresh) return;
    void placement.placeAt({ shelf, books: books.data.items, bookId: d.bookId, rowIndex: Number(d.rowId), index: d.index }, fresh);
  };

  /** From the "place in…" dialog: the end of the chosen row of the chosen unit. */
  const placeAtEnd = async (book: BookOut, target: ShelfOut, targetBooks: Parameters<typeof placement.placeAt>[0]['books'], rowIndex: number) => {
    const index = targetBooks.filter((b) => b.row_index === rowIndex).length;
    const ok = await placement.placeAt({ shelf: target, books: targetBooks, bookId: book.id, rowIndex, index }, book);
    if (ok) {
      setDialog(null);
      params.set({ unit: target.id });
    }
  };

  const removeFromShelf = async (book: SpineBook) => {
    if (await placement.unplace(book.id)) setSpine(null);
  };

  const save = async (current: ShelfOut | undefined, v: ShelfValues) => {
    if (current) {
      const patch = patchBody(current, v);
      if (Object.keys(patch).length > 0) await writes.update.mutateAsync({ id: current.id, patch });
      return;
    }
    const created = await writes.create.mutateAsync(createBody(v));
    params.set({ unit: created.id, book: '' });
  };

  const confirmDelete = async (target: ShelfOut) => {
    setError(null);
    try {
      await writes.remove.mutateAsync(target.id);
      params.set({ unit: '', book: '' });
    } catch (e) {
      setError(apiErrorMessage(t, e));
    }
    setDialog(null);
  };

  return {
    canWrite,
    params,
    list,
    shelves,
    shelf,
    books,
    unshelved,
    search,
    setSearch,
    placed,
    drop,
    placeAtEnd,
    placing: placement.busy,
    removeFromShelf,
    save,
    confirmDelete,
    deleting: writes.remove.isPending,
    error,
    dialog,
    setDialog,
    spine,
    setSpine,
  };
}
