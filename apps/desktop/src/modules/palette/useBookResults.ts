import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';
import { MIN_BOOK_CHARS } from './model';

export const BOOK_DELAY_MS = 200;
export const BOOK_LIMIT = 8;

/** The text, once the typing has paused. */
function useSettled(text: string): string {
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const id = setTimeout(() => setSettled(text), BOOK_DELAY_MS);
    return () => clearTimeout(id);
  }, [text]);
  return settled;
}

/** Catalogue search for the palette: from two characters, 200 ms after the last key, at most eight books. */
export function useBookResults(text: string, enabled: boolean) {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const q = useSettled(text.trim());
  const active = enabled && q.length >= MIN_BOOK_CHARS;
  const query = useQuery({
    queryKey: ['books', connectionId, 'palette', q],
    enabled: active,
    retry: false,
    queryFn: () => client.listBooks({ q, limit: BOOK_LIMIT }),
  });
  return {
    books: active ? (query.data?.items ?? []) : [],
    // Typing is still being awaited or the answer is on its way.
    pending: enabled && text.trim().length >= MIN_BOOK_CHARS && (q !== text.trim() || query.isPending),
  };
}

/** Shelf units, to name where a book stands. Only asked for when the question is "where". */
export function useShelfNames(enabled: boolean) {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  return useQuery({
    queryKey: ['shelves', connectionId, 'list'],
    enabled,
    retry: false,
    queryFn: () => client.listShelves(),
  }).data?.items;
}
