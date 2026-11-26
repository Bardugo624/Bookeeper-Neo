import { useEffect, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateLoan, LoanOut } from '@bookeeper/api';
import { useClient, useSession } from '../../session';

export const PAGE_SIZE = 50;

export type LoanScope = 'active' | 'returned';

/** Loans of one scope, in pages in the order of the core; the next page comes with `fetchNextPage`. */
export function useLoanList(scope: LoanScope) {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  const query = useInfiniteQuery({
    queryKey: ['loans', libraryId, 'list', scope],
    initialPageParam: 0,
    retry: false,
    queryFn: ({ pageParam }) => client.listLoans({ status: scope, limit: PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return last.items.length > 0 && loaded < last.total ? loaded : undefined;
    },
  });
  const items: LoanOut[] = query.data?.pages.flatMap((p) => p.items) ?? [];
  return { query, items };
}

/** The open loan of a book, if any; `enabled` is false for a book that is not on loan. */
export function useBookLoan(bookId: string, enabled: boolean) {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  const query = useQuery({
    queryKey: ['loans', libraryId, 'book', bookId],
    enabled,
    retry: false,
    queryFn: async () => (await client.listLoans({ status: 'active', book_id: bookId, limit: 1 })).items[0] ?? null,
  });
  return { loan: query.data ?? undefined, isError: query.isError, refetch: query.refetch };
}

const NAME_DELAY_MS = 250;

/** The value once it stopped changing for `delay` ms. */
function useSettled(value: string, delay: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return settled;
}

/** People of the library first, then the names used before; the typed prefix narrows the names. */
export function useBorrowerChoices(typed: string) {
  const prefix = useSettled(typed, NAME_DELAY_MS);
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  const people = useQuery({
    queryKey: ['people', libraryId],
    retry: false,
    queryFn: async () => (await client.listUsers()).items,
  });
  const names = useQuery({
    queryKey: ['loans', libraryId, 'borrowers', prefix],
    retry: false,
    queryFn: async () => (await client.listBorrowers(prefix.trim() || undefined)).items,
  });
  return { people: people.data ?? [], names: names.data ?? [] };
}

/** After a write: loans, books (loan flag), people and `me`. */
function useRefresh() {
  const queryClient = useQueryClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return () =>
    Promise.all(
      [['loans', libraryId], ['books', libraryId], ['people', libraryId], ['facets'], ['me']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export function useCreateLoan() {
  const client = useClient();
  const refresh = useRefresh();
  return useMutation<LoanOut, unknown, CreateLoan>({
    mutationFn: (body) => client.createLoan(body),
    onSuccess: refresh,
  });
}

export function useReturnLoan() {
  const client = useClient();
  const refresh = useRefresh();
  return useMutation<LoanOut, unknown, string>({
    mutationFn: (id) => client.returnLoan(id),
    onSuccess: refresh,
  });
}
