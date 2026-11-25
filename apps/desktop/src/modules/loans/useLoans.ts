import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';
import type { LoanFilter } from './listParams';

export const PAGE_SIZE = 50;

/** Root of every query of this module: mutations invalidate it as a whole. */
export function useLoansKey(): readonly ['loans', string | undefined] {
  const connectionId = useSession((s) => s.connection?.id);
  return ['loans', connectionId];
}

/** Loans for a filter (and optionally one book), in pages; the next page comes with `fetchNextPage`. */
export function useLoanList(filter: LoanFilter, book: string) {
  const client = useClient();
  const key = useLoansKey();
  const params = { status: filter, book_id: book || undefined };
  const query = useInfiniteQuery({
    queryKey: [...key, 'list', params],
    initialPageParam: 0,
    retry: false,
    queryFn: ({ pageParam }) => client.listLoans({ ...params, limit: PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return last.items.length > 0 && loaded < last.total ? loaded : undefined;
    },
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return { query, items };
}

function useCount(status: 'active' | 'overdue', book: string): number | undefined {
  const client = useClient();
  const key = useLoansKey();
  const { data } = useQuery({
    queryKey: [...key, 'count', status, book],
    retry: false,
    queryFn: () => client.listLoans({ status, book_id: book || undefined, limit: 1 }),
  });
  return data?.total;
}

/** Open and overdue totals for the header line. */
export function useLoanCounts(book: string): { active: number | undefined; overdue: number | undefined } {
  return { active: useCount('active', book), overdue: useCount('overdue', book) };
}
