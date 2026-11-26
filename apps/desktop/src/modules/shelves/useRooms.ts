import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateRoom, PatchRoom, RoomOut } from '@bookeeper/api';
import { useClient } from '../../session';
import { useKeys } from './useShelves';

export function useRoomList() {
  const client = useClient();
  const keys = useKeys();
  return useQuery({ queryKey: keys.rooms, retry: false, queryFn: () => client.listRooms() });
}

/** Room writes. Each refreshes the rooms and everything that shows shelves (names, counts, books' rooms). */
export function useRoomWrites() {
  const client = useClient();
  const keys = useKeys();
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: keys.shelves }), qc.invalidateQueries({ queryKey: ['books'] })]);

  const create = useMutation<RoomOut, unknown, CreateRoom>({
    mutationFn: (body) => client.createRoom(body),
    onSuccess: refresh,
  });
  const update = useMutation<RoomOut, unknown, { id: string; patch: PatchRoom }>({
    mutationFn: ({ id, patch }) => client.updateRoom(id, patch),
    onSuccess: refresh,
  });
  const remove = useMutation<void, unknown, string>({
    mutationFn: (id) => client.deleteRoom(id),
    onSuccess: refresh,
  });
  return { create, update, remove };
}
