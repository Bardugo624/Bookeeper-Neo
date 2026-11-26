import { useEffect, useRef } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';
import { toApiFilters } from './filterModel';
import type { ListState } from './listParams';

export const PAGE_SIZE = 60;

/** Fetches the list in pages of 60; the next page is requested with `fetchNextPage`. */
export function useBookList(state: Pick<ListState, 'q' | 'sort' | 'order' | 'filters'>) {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const q = state.q.trim();
  const params = {
    q: q || undefined,
    ...toApiFilters(state.filters),
    sort: state.sort ?? undefined,
    // The API refuses `order` without `sort`.
    order: state.sort ? state.order : undefined,
  };
  const query = useInfiniteQuery({
    queryKey: ['books', connectionId, 'list', params],
    initialPageParam: 0,
    retry: false,
    queryFn: ({ pageParam }) => client.listBooks({ ...params, limit: PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return last.items.length > 0 && loaded < last.total ? loaded : undefined;
    },
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total;
  return { query, items, total };
}

/** Number of books with an open loan, from a one-item request. */
export function useOnLoanCount(): number | undefined {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const { data } = useQuery({
    queryKey: ['books', connectionId, 'loan-count'],
    retry: false,
    queryFn: () => client.listBooks({ on_loan: true, limit: 1 }),
  });
  return data?.total;
}

/**
 * Calls `onReach` whenever the returned element comes into view while `enabled`.
 * `watch` re-arms the observer after more items were added and the end is still visible.
 */
export function useEndReached(onReach: () => void, enabled: boolean, watch: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(onReach);
  latest.current = onReach;
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) latest.current();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, watch]);
  return ref;
}
