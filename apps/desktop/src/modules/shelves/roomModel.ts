import { ApiError, type RoomOut, type ShelfOut } from '@bookeeper/api';
import type { Translate } from '../../app';
import { apiErrorMessage } from '../../kit';

/** Longest room name the core accepts. */
export const ROOM_NAME_MAX = 60;

/** Select values for "no room" and "create a room"; Radix does not accept an empty value. */
export const NO_ROOM = '__none__';
export const NEW_ROOM = '__new__';

export interface ShelfGroup {
  /** Room id; null for the shelves without a room. */
  id: string | null;
  name: string | null;
  shelves: ShelfOut[];
}

/** The room a shelf sits in, by the name the shelf carries or the room list gives. */
export function roomOf(shelf: ShelfOut, rooms: RoomOut[]): { id: string; name: string } | null {
  if (shelf.room) return shelf.room;
  if (!shelf.room_id) return null;
  const found = rooms.find((r) => r.id === shelf.room_id);
  return found ? { id: found.id, name: found.name } : null;
}

/** Shelves split by room, rooms by name; the shelves without a room come last. */
export function groupByRoom(shelves: ShelfOut[], rooms: RoomOut[]): ShelfGroup[] {
  const byRoom = new Map<string, ShelfGroup>();
  const loose: ShelfOut[] = [];
  for (const shelf of shelves) {
    const room = roomOf(shelf, rooms);
    if (!room) {
      loose.push(shelf);
      continue;
    }
    const group = byRoom.get(room.id) ?? { id: room.id, name: room.name, shelves: [] };
    group.shelves.push(shelf);
    byRoom.set(room.id, group);
  }
  const groups = [...byRoom.values()].sort((a, b) => a.name!.localeCompare(b.name!));
  return loose.length > 0 ? [...groups, { id: null, name: null, shelves: loose }] : groups;
}

/** 'required' or 'tooLong' when the name cannot be sent, null when it can. */
export function roomNameProblem(name: string): 'required' | 'tooLong' | null {
  const text = name.trim();
  if (!text) return 'required';
  return [...text].length > ROOM_NAME_MAX ? 'tooLong' : null;
}

export function isRoomExists(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'room_exists';
}

/** Text for a failed room write, shown beside the name field. */
export function roomErrorMessage(t: Translate, error: unknown): string {
  return apiErrorMessage(t, error, {
    room_exists: t('shelves.rooms.errors.exists'),
    validation: t('shelves.rooms.errors.invalid', { max: ROOM_NAME_MAX }),
  });
}
