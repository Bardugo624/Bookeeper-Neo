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

/** One piece of furniture with its size and color. */
export function useShelf(id: string, enabled: boolean) {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({
    queryKey: ['shelves', libraryId, 'detail', id],
    enabled,
    queryFn: () => client.getShelf(id),
  });
}

/** The books on one piece of furniture, with row and slot. */
export function useShelfBooks(id: string, enabled: boolean) {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({
    queryKey: ['shelves', libraryId, 'books', id],
    enabled,
    queryFn: async () => (await client.listShelfBooks(id)).items,
  });
}
