import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';

export function useBook(id: string) {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({
    queryKey: ['books', libraryId, 'detail', id],
    queryFn: () => client.getBook(id),
  });
}

/** Furniture names by id, to turn a placement into something readable. A failure only hides the name. */
export function useShelfNames(enabled: boolean): Map<string, string> {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  const { data } = useQuery({
    queryKey: ['shelves', libraryId, 'names'],
    enabled,
    queryFn: () => client.listShelves(),
  });
  return new Map((data?.items ?? []).map((s) => [s.id, s.name]));
}
