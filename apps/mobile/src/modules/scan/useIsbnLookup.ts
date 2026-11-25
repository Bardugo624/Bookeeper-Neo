import { useQuery } from '@tanstack/react-query';
import { ApiError, type BookOut, type Metadata } from '@bookeeper/api';
import { useClient, useSession, type Client } from '../../session';
import type { Isbn } from './isbn';

export type Lookup =
  | { kind: 'owned'; book: BookOut }
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

/** Answers "do I have it, and if not, what is it?". Nothing is kept: every scan asks again. */
export function useIsbnLookup(isbn: Isbn | null) {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({
    queryKey: ['scan', libraryId, isbn?.isbn13],
    enabled: isbn !== null,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: () => resolve(client, isbn!),
  });
}
