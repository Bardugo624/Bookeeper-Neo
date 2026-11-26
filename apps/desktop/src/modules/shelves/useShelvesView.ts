import { useCallback, useRef, useState } from 'react';
import type { BookOut, ShelfOut } from '@bookeeper/api';
import type { SlotDrop, SpineBook } from '@bookeeper/ui/shelf';
import { useT } from '../../app';
import { apiErrorMessage, stringParam, useListParams, usePermission } from '../../kit';
import { createBody, patchBody, roomIdOf, type ShelfValues } from './formModel';
import { NEW_ROOM, groupByRoom } from './roomModel';
import { useRoomList, useRoomWrites } from './useRooms';
import { usePlacement } from './usePlacement';
import { useWhere } from './useWhere';
import { useShelfBooks, useShelfList, useUnshelved } from './useShelves';
import { useDebounced } from './useDebounced';
import { useShelfWrites } from './useShelfWrites';

const PARAMS = { unit: stringParam(), book: stringParam(), room: stringParam() };

export type Dialog =
  | { kind: 'form'; shelf?: ShelfOut }
  | { kind: 'delete'; shelf: ShelfOut }
  | { kind: 'place'; book: BookOut }
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
  const where = useWhere(params.values.book, shelf, books.data?.items, (unit) => params.set({ unit }));
  const doneWhere = useCallback(() => params.set({ book: '' }), [params]);
  const placement = usePlacement();
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
    placing: placement.busy,
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
