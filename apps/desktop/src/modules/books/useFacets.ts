import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';

/** Values of the library to filter by, with their counts. Writes invalidate the `facets` key. */
export function useFacets() {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  return useQuery({
    queryKey: ['facets', connectionId],
    retry: false,
    staleTime: 30_000,
    queryFn: () => client.getBookFacets(),
  });
}

/** Every shelf with the room it is in: the shelf list depends on the chosen room. */
export function useShelfRooms(): Array<{ id: string; name: string; roomId: string | null }> {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const { data } = useQuery({
    queryKey: ['shelves', connectionId, 'names'],
    retry: false,
    queryFn: () => client.listShelves(),
  });
  return (data?.items ?? []).map((s) => ({ id: s.id, name: s.name, roomId: s.room?.id ?? s.room_id ?? null }));
}
