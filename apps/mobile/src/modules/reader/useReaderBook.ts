import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';

/** The book that is read: its title and authors. Same cache entry as the book's page. */
export function useReaderBook(id: string, enabled: boolean) {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({ queryKey: ['books', libraryId, 'detail', id], enabled, retry: false, queryFn: () => client.getBook(id) });
}
