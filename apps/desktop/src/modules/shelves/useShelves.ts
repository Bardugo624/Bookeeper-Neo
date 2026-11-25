import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';

/** Most unplaced books requested at once; the search narrows the rest. */
export const UNSHELVED_LIMIT = 100;

/** Query-key roots, so a write can name what it touches. */
export function useKeys() {
  const id = useSession((s) => s.connection?.id);
  return {
    shelves: ['shelves', id] as const,
    list: ['shelves', id, 'list'] as const,
    books: (shelfId: string) => ['shelves', id, 'books', shelfId] as const,
    unshelved: ['shelves', id, 'unshelved'] as const,
  };
}

export function useShelfList() {
  const client = useClient();
  const keys = useKeys();
  return useQuery({ queryKey: keys.list, retry: false, queryFn: () => client.listShelves() });
}

/** The books of one shelf unit; `undefined` disables the query. */
export function useShelfBooks(shelfId: string | undefined) {
  const client = useClient();
  const keys = useKeys();
  return useQuery({
    queryKey: keys.books(shelfId ?? ''),
    enabled: shelfId !== undefined,
    retry: false,
    queryFn: () => client.listShelfBooks(shelfId!),
  });
}

/** Books with no placement, optionally narrowed by a search text. */
export function useUnshelved(q: string) {
  const client = useClient();
  const keys = useKeys();
  const text = q.trim();
  return useQuery({
    queryKey: [...keys.unshelved, text],
    retry: false,
    queryFn: () => client.listBooks({ unshelved: true, q: text || undefined, limit: UNSHELVED_LIMIT }),
  });
}
