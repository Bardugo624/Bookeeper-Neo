import type { ShelfBook, ShelfOut } from '@bookeeper/api';

export interface RowFill {
  /** 0-based. */
  row: number;
  books: number;
  /** Slots after the last occupied one: where the next books can go. */
  free: number;
}

export interface RoomGroup {
  /** The room's name; `null` for the shelves without a room. */
  room: string | null;
  shelves: ShelfOut[];
}

/** Rooms in the order they first appear, the shelves without a room last. */
export function groupByRoom(shelves: ShelfOut[]): RoomGroup[] {
  const groups: RoomGroup[] = [];
  const none: ShelfOut[] = [];
  for (const shelf of shelves) {
    const name = shelf.room?.name;
    if (!name) {
      none.push(shelf);
      continue;
    }
    const group = groups.find((g) => g.room === name);
    if (group) group.shelves.push(shelf);
    else groups.push({ room: name, shelves: [shelf] });
  }
  return none.length > 0 ? [...groups, { room: null, shelves: none }] : groups;
}

/** Books and free places of each row; a row with no free place after its last book is full. */
export function rowFills(shelf: ShelfOut, books: ShelfBook[]): RowFill[] {
  return Array.from({ length: shelf.rows }, (_, row) => {
    const here = books.filter((b) => b.row_index === row);
    const next = here.reduce((n, b) => Math.max(n, b.slot_index + 1), 0);
    return { row, books: here.length, free: Math.max(0, shelf.slots_per_row - next) };
  });
}
