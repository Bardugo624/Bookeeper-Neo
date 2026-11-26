import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError, type BookOut, type Metadata } from '@bookeeper/api';
import { usePlatform } from '../../platform';
import { useClient, useSession, type Client } from '../../session';
import type { Isbn } from './isbn';
import { libraryIndexFor, type IndexEntry } from './libraryIndex';

export type Lookup =
  | { kind: 'owned'; book: BookOut }
  /** Known from the copy kept on the phone; the server has not answered (yet). */
  | { kind: 'local'; entry: IndexEntry }
  /** Not in the copy kept on the phone, and no network to ask further. */
  | { kind: 'offline'; syncedAt: number | null }
  | { kind: 'found'; meta: Metadata }
  | { kind: 'none' };

/** The book already in the library with this ISBN, searched in both forms; the exact match wins over the fuzzy one. */
export async function findOwned(client: Client, isbn: Isbn): Promise<BookOut | null> {
  const forms = [isbn.isbn13, ...(isbn.isbn10 ? [isbn.isbn10] : [])];
  for (const q of forms) {
    const { items } = await client.listBooks({ q, limit: 10 });
    const hit = items.find((b) => b.isbn_13 === isbn.isbn13 || (isbn.isbn10 !== null && b.isbn_10 === isbn.isbn10));
    if (hit) return hit;
  }
  return null;
}

async function resolve(client: Client, isbn: Isbn): Promise<Lookup> {
  const book = await findOwned(client, isbn);
  if (book) return { kind: 'owned', book };
  try {
    const meta = await client.lookupIsbn(isbn.isbn13);
    return meta.title?.trim() ? { kind: 'found', meta } : { kind: 'none' };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { kind: 'none' };
    throw e;
  }
}

/** The phone's own copy first: it answers at once and without the network. */
function useLocalEntry(isbn: Isbn | null) {
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({
    queryKey: ['scan', libraryId, 'local', isbn?.isbn13],
    enabled: isbn !== null && libraryId !== undefined,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    queryFn: async () => {
      try {
        const index = libraryIndexFor(libraryId!);
        const [entry, meta] = await Promise.all([index.get(isbn!.isbn13), index.meta()]);
        return { entry, syncedAt: meta?.syncedAt ?? null };
      } catch {
        // A broken local copy is the same as none: the server is asked as usual.
        return { entry: null, syncedAt: null };
      }
    },
  });
}

/**
 * Answers "do I have it, and if not, what is it?". Nothing of the server's answer is kept: every scan asks
 * again. A hit in the local copy shows at once and is replaced by the server's answer when it comes; with
 * no network the local copy is the whole answer.
 */
export function useIsbnLookup(isbn: Isbn | null) {
  const client = useClient();
  const { network } = usePlatform();
  const online = useSyncExternalStore(network.subscribe, network.online, () => true);
  const libraryId = useSession((s) => s.me?.library.id);
  const local = useLocalEntry(isbn);
  const remote = useQuery({
    queryKey: ['scan', libraryId, isbn?.isbn13],
    enabled: isbn !== null && online,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: () => resolve(client, isbn!),
  });

  const entry = local.data?.entry ?? null;
  let data: Lookup | undefined = remote.data;
  if (!data && entry) data = { kind: 'local', entry };
  else if (!data && !online && local.data) data = { kind: 'offline', syncedAt: local.data.syncedAt };
  const waiting = !data && (local.isPending || (online && remote.isPending));
  const error = !data && !waiting && remote.isError ? remote.error : null;
  return {
    data,
    isError: error !== null,
    error,
    refetch: () => remote.refetch(),
    isPending: waiting,
  };
}
