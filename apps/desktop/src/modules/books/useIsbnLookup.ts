import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { BookOut, Metadata } from '@bookeeper/api';
import { ApiError } from '@bookeeper/api';
import { useClient, useSession } from '../../session';
import { isbnForms } from './isbn';

export type LookupOutcome =
  | { kind: 'found'; metadata: Metadata; existing: BookOut | null }
  | { kind: 'notFound'; existing: BookOut | null }
  | { kind: 'failed'; error: unknown };

/**
 * The book already in the library under this ISBN, in either of its forms (an ISBN-10 and its
 * ISBN-13 are the same book). The core has no "duplicate ISBN" error, so the library is searched.
 */
export async function findExistingByIsbn(client: ReturnType<typeof useClient>, isbn: string | string[]): Promise<BookOut | null> {
  const forms = [...new Set((Array.isArray(isbn) ? isbn : [isbn]).flatMap((i) => isbnForms(i)))];
  if (forms.length === 0) return null;
  const found = await Promise.all(
    forms.map((q) => client.listBooks({ q, limit: 20 }).then((r) => r.items, () => [] as BookOut[])),
  );
  return found.flat().find((b) => forms.includes(b.isbn_13 ?? '') || forms.includes(b.isbn_10 ?? '')) ?? null;
}

/** The ISBN a hand-typed form holds, once typing paused: the duplicate, when the library has one. */
export function useTypedIsbnDuplicate(isbn13: string, isbn10: string, enabled: boolean): BookOut | null {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const typed = `${isbn13}|${isbn10}`;
  const [settled, setSettled] = useState(typed);
  useEffect(() => {
    const id = setTimeout(() => setSettled(typed), TYPING_PAUSE_MS);
    return () => clearTimeout(id);
  }, [typed]);
  const [a = '', b = ''] = settled.split('|');
  const forms = [...new Set([...isbnForms(a), ...isbnForms(b)])];
  const query = useQuery({
    queryKey: ['books', connectionId, 'isbn-duplicate', forms],
    enabled: enabled && forms.length > 0,
    retry: false,
    gcTime: 0,
    queryFn: () => findExistingByIsbn(client, forms),
  });
  return enabled && forms.length > 0 ? (query.data ?? null) : null;
}

/** Quiet time after the last keystroke before a typed ISBN is searched. */
export const TYPING_PAUSE_MS = 500;

/**
 * ISBN lookup through the core, which merges Google Books, Open Library and Anna's Archive and
 * names the ones that answered in `sources`. The core has no "duplicate ISBN" error, so the library
 * is searched for the same ISBN too, to point at the copy that is already there.
 */
export function useIsbnLookup() {
  const client = useClient();
  return useMutation({
    mutationFn: async (isbn: string): Promise<LookupOutcome> => {
      const existing = await findExistingByIsbn(client, isbn);
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
