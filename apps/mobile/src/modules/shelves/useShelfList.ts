import { useQuery } from '@tanstack/react-query';
import type { ShelfOut } from '@bookeeper/api';
import { useClient, useSession } from '../../session';

export function useShelfList() {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({
    queryKey: ['shelves', libraryId, 'names'],
    queryFn: () => client.listShelves(),
  });
}

export interface RoomGroup {
  /** `null` for the furniture that is in no room. */
  room: { id: string; name: string } | null;
  shelves: ShelfOut[];
}

/** Furniture by room (rooms by name, the roomless last); furniture by name inside each. */
export function groupByRoom(shelves: ShelfOut[]): RoomGroup[] {
  const byName = (a: ShelfOut, b: ShelfOut) => a.name.localeCompare(b.name);
  const rooms = new Map<string, RoomGroup>();
  const loose: ShelfOut[] = [];
  for (const s of shelves) {
    if (!s.room) {
      loose.push(s);
      continue;
    }
    const group = rooms.get(s.room.id) ?? { room: s.room, shelves: [] };
    group.shelves.push(s);
    rooms.set(s.room.id, group);
  }
  const groups = [...rooms.values()].sort((a, b) => a.room!.name.localeCompare(b.room!.name));
  if (loose.length > 0) groups.push({ room: null, shelves: loose });
  return groups.map((g) => ({ ...g, shelves: [...g.shelves].sort(byName) }));
}
