import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';

/** The furniture of the library, for choosing where to start. */
export function useShelfList() {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({
    queryKey: ['scan', libraryId, 'shelf-list'],
    retry: false,
    gcTime: 0,
    queryFn: async () => (await client.listShelves()).items,
  });
}

/** The books of one piece of furniture; read fresh every time, since the rows fill up as we go. */
export function useShelfFill(shelfId: string | null) {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({
    queryKey: ['scan', libraryId, 'shelf-fill', shelfId],
    enabled: shelfId !== null,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    queryFn: async () => (await client.listShelfBooks(shelfId!)).items,
  });
}
