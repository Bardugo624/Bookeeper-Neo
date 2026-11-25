import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';

export function useBook(id: string) {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  return useQuery({
    queryKey: ['books', connectionId, 'detail', id],
    retry: false,
    queryFn: () => client.getBook(id),
  });
}

/** Shelf names by id, to turn a placement into something readable. */
export function useShelfNames(): Map<string, string> {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const { data } = useQuery({
    queryKey: ['shelves', connectionId, 'names'],
    retry: false,
    queryFn: () => client.listShelves(),
  });
  return new Map((data?.items ?? []).map((s) => [s.id, s.name]));
}
