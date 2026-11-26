import { useCallback, useRef, useState } from 'react';
import type { BookOut, ShelfBook, ShelfOut } from '@bookeeper/api';
import type { SlotDrop, SpineBook } from '@bookeeper/ui/shelf';
import { useT } from '../../app';
import { apiErrorMessage, stringParam, useListParams, usePermission } from '../../kit';
import { createBody, patchBody, roomIdOf, type ShelfValues } from './formModel';
import { NEW_ROOM, groupByRoom } from './roomModel';
import { useRoomList, useRoomWrites } from './useRooms';
import { useMoveWrites } from './useMoveWrites';
import { inRow, isSamePlace } from './model';
import { usePlacement } from './usePlacement';
import { useWhere } from './useWhere';
import { useShelfBooks, useShelfList, useUnshelved } from './useShelves';
import { useDebounced } from './useDebounced';
import { useShelfWrites } from './useShelfWrites';

const PARAMS = { unit: stringParam(), book: stringParam(), room: stringParam() };

type PlaceDialogState = { book: { id: string; title: string }; fresh?: BookOut };

export type Dialog =
  | { kind: 'form'; shelf?: ShelfOut }
  | { kind: 'delete'; shelf: ShelfOut }
  /** `fresh` is the book when it is unplaced; `row` the shelf it stands on now. */
  | { kind: 'place'; book: { id: string; title: string }; fresh?: BookOut; row?: number }
  | { kind: 'rooms' }
  | null;

/** Everything the shelves page shows and does: the chosen unit, its books, the unplaced list and the writes. */
export function useShelvesView() {
  const t = useT();
  const { can } = usePermission();
  const canWrite = can('write');
  const params = useListParams(PARAMS);
  const list = useShelfList();
  const roomList = useRoomList();
  const rooms = roomList.data?.items ?? [];
  const all = list.data?.items ?? [];
  const roomId = params.values.room;
  const groups = groupByRoom(roomId ? all.filter((s) => s.room_id === roomId) : all, rooms);
  // In the order the tabs show them, so the first one is the one that opens.
  const shelves = groups.flatMap((g) => g.shelves);
  const shelf = shelves.find((s) => s.id === params.values.unit) ?? shelves[0];
  const books = useShelfBooks(shelf?.id);
  const [search, setSearch] = useState('');
  const unshelved = useUnshelved(useDebounced(search));
  const where = useWhere(params.values.book, shelf, books.data?.items, (unit) =>
    // "Where is it?" wins over the room filter: a filter that hides the unit is lifted.
    params.set({ unit, ...(roomId && !shelves.some((s) => s.id === unit) ? { room: '' } : {}) }),
  );
  const doneWhere = useCallback(() => params.set({ book: '' }), [params]);
  const placement = usePlacement();
  const moves = useMoveWrites();
  const writes = useShelfWrites();
  const roomWrites = useRoomWrites();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [spine, setSpine] = useState<SpineBook | null>(null);
  const [error, setError] = useState<string | null>(null);

  const placed = shelves.reduce((n, s) => n + s.book_count, 0);

  const drop = (d: SlotDrop) => {
    if (!shelf || !books.data) return;
    const known = books.data.items.some((b) => b.book_id === d.bookId);
    const fresh = known ? undefined : unshelved.data?.items.find((b) => b.id === d.bookId);
    if (!known && !fresh && !moves.isPlaced(d.bookId)) return;
    void placement.placeAt({ shelf, books: books.data.items, bookId: d.bookId, rowIndex: Number(d.rowId), index: d.index }, fresh);
  };

  /** From the "place in…" dialog: the end of the chosen row of the chosen unit. */
  const placeAtEnd = async (d: PlaceDialogState, target: ShelfOut, targetBooks: ShelfBook[], rowIndex: number) => {
    const index = targetBooks.filter((b) => b.row_index === rowIndex && b.book_id !== d.book.id).length;
    // Confirming the place the book already has changes nothing: just close.
    if (isSamePlace(inRow(targetBooks, rowIndex), d.book.id, index)) {
      setDialog(null);
      return;
    }
    const ok = await placement.placeAt({ shelf: target, books: targetBooks, bookId: d.book.id, rowIndex, index }, d.fresh);
    if (ok) {
      setDialog(null);
      params.set({ unit: target.id });
    }
  };

  /** A book dropped on a cabinet's tab: the first shelf with a free place. */
  const dropOnTab = async (bookId: string, unitId: string) => {
    const target = all.find((s) => s.id === unitId);
    if (!target) return;
    if (moves.busy) return;
    const here = unitId === shelf?.id && books.data?.items.some((b) => b.book_id === bookId);
    if (here) return;
    const fresh = unshelved.data?.items.find((b) => b.id === bookId);
    if (!fresh && !moves.isPlaced(bookId)) return;
    if (await moves.placeFirstFree(bookId, target, fresh)) params.set({ unit: target.id, book: '' });
  };

  const bookOf = (id: string) => books.data?.items.find((b) => b.book_id === id);

  /** "Move to…" from the spine menu, with the book's cabinet and shelf preselected. */
  const moveSpine = (book: SpineBook) => {
    setSpine(null);
    setDialog({ kind: 'place', book: { id: book.id, title: book.title }, row: bookOf(book.id)?.row_index });
  };

  const setWidth = (book: SpineBook, width: number | null) => {
    const found = bookOf(book.id);
    if (shelf && found) void moves.setWidth({ shelf, book: found, width });
  };

  const removeFromShelf = async (book: SpineBook) => {
    if (await placement.unplace(book.id)) setSpine(null);
  };

  // A room made by an earlier try of the open form whose cabinet write failed: reused, not
  // created twice. Forgotten once a save succeeds or a form opens, so a room renamed or
  // deleted since is never reused.
  const madeRoom = useRef<{ name: string; id: string } | null>(null);

  const openDialog = (d: Dialog) => {
    if (d?.kind === 'form') madeRoom.current = null;
    setDialog(d);
  };

  const reusable = (name: string) => {
    const kept = madeRoom.current;
    if (!kept || kept.name !== name) return undefined;
    const listed = rooms.find((r) => r.id === kept.id);
    return !listed || listed.name === name ? kept.id : undefined;
  };

  const save = async (current: ShelfOut | undefined, v: ShelfValues) => {
    let createdId: string | undefined;
    if (v.room === NEW_ROOM) {
      const name = v.newRoom.trim();
      createdId = reusable(name);
      if (!createdId) {
        const created = await roomWrites.create.mutateAsync({ name });
        madeRoom.current = { name, id: created.id };
        createdId = created.id;
      }
    }
    const room = roomIdOf(v, createdId);
    if (current) {
      const patch = patchBody(current, v, room);
      if (Object.keys(patch).length > 0) await writes.update.mutateAsync({ id: current.id, patch });
      madeRoom.current = null;
      return;
    }
    const made = await writes.create.mutateAsync(createBody(v, room));
    madeRoom.current = null;
    // A filter that would hide the new cabinet is lifted.
    params.set({ unit: made.id, book: '', ...(roomId && made.room_id !== roomId ? { room: '' } : {}) });
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
    all,
    rooms,
    groups,
    shelves,
    shelf,
    books,
    unshelved,
    search,
    setSearch,
    placed,
    drop,
    placeAtEnd,
    dropOnTab,
    moveSpine,
    setWidth,
    widthOf: (id: string) => bookOf(id)?.spine_width ?? null,
    placing: placement.busy || moves.busy,
    removeFromShelf,
    save,
    confirmDelete,
    deleting: writes.remove.isPending,
    error,
    dialog,
    setDialog: openDialog,
    spine,
    setSpine,
    where,
    doneWhere,
  };
}
