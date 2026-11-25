import { useMutation, useQuery } from '@tanstack/react-query';
import type { BookOut, Metadata } from '@bookeeper/api';
import { ApiError } from '@bookeeper/api';
import { useClient, useSession } from '../../session';

export type LookupOutcome =
  | { kind: 'found'; metadata: Metadata; existing: BookOut | null }
  | { kind: 'notFound'; existing: BookOut | null }
  | { kind: 'failed'; error: unknown };

/**
 * ISBN lookup through the core, which merges Google Books, Open Library and Anna's Archive and
 * names the ones that answered in `sources`. The core has no "duplicate ISBN" error, so the library
 * is searched for the same ISBN too, to point at the copy that is already there.
 */
export function useIsbnLookup() {
  const client = useClient();
  return useMutation({
    mutationFn: async (isbn: string): Promise<LookupOutcome> => {
      const existing = await client
        .listBooks({ q: isbn, limit: 20 })
        .then((r) => r.items.find((b) => b.isbn_13 === isbn || b.isbn_10 === isbn) ?? null)
        .catch(() => null);
      try {
        return { kind: 'found', metadata: await client.lookupIsbn(isbn), existing };
      } catch (error) {
        if (error instanceof ApiError && error.code === 'isbn_not_found') return { kind: 'notFound', existing };
        return { kind: 'failed', error };
      }
    },
  });
}

/** The number the core proposes for the next book; fetched when the form opens. */
export function useNextProgressive(enabled: boolean) {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  return useQuery({
    queryKey: ['books', connectionId, 'next-progressive'],
    enabled,
    retry: false,
    gcTime: 0,
    queryFn: () => client.nextProgressive(),
  });
}
