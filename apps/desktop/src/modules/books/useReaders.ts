import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';

/** Who of the library has a reading state for the book. */
export function useReaders(bookId: string) {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const { data } = useQuery({
    queryKey: ['books', connectionId, 'readers', bookId],
    retry: false,
    queryFn: () => client.listReaders(bookId),
  });
  return data?.items ?? [];
}
