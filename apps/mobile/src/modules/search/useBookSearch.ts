import { useEffect, useRef } from 'react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { ApiError, type BookOut } from '@bookeeper/api';
import { useClient, useSession } from '../../session';
import type { SearchState } from './searchState';

export const PAGE_SIZE = 40;

interface Result {
  items: BookOut[];
  total: number | undefined;
}

export type SearchStatus = 'pending' | 'error' | 'ready';

/** `network` is what the transport reports when the server cannot be reached. */
const unreachable = (e: unknown) => e instanceof ApiError && e.status === 0;

/**
 * Books matching the search, 40 at a time. Without text the server answers with the latest added.
 * While a new search loads, and when it cannot reach the server, the last result stays on screen.
 */
export function useBookSearch(state: SearchState) {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  const q = state.q.trim();
  const params = {
    q: q || undefined,
    on_loan: state.filter === 'loan' ? true : undefined,
    unshelved: state.filter === 'unshelved' ? true : undefined,
    reading: state.reading ?? undefined,
    tag_id: state.tags.length > 0 ? state.tags : undefined,
    room_id: state.room ?? undefined,
  };
  const query = useInfiniteQuery({
    queryKey: ['books', libraryId, 'search', params],
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) => client.listBooks({ ...params, limit: PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return last.items.length > 0 && loaded < last.total ? loaded : undefined;
    },
  });

  const own: Result | undefined = query.data
    ? { items: query.data.pages.flatMap((p) => p.items), total: query.data.pages[0]?.total }
    : undefined;
  // The last answer that really came from the server, kept for when the next search finds no network.
  const lastGood = useRef<Result | undefined>(undefined);
  useEffect(() => {
    if (own && !query.isPlaceholderData) lastGood.current = own;
  });

  const offlineFallback = !own && query.isError && unreachable(query.error) ? lastGood.current : undefined;
  const shown = own ?? offlineFallback;
  let status: SearchStatus = 'pending';
  if (shown) status = 'ready';
  else if (query.isError) status = 'error';
  return {
    status,
    items: shown?.items ?? [],
    total: shown?.total,
    /** What is shown is the previous search, while the new one loads or cannot be reached. */
    stale: query.isPlaceholderData || offlineFallback !== undefined,
    error: query.error,
    refetch: () => void query.refetch(),
    hasNextPage: query.hasNextPage && !query.isPlaceholderData && offlineFallback === undefined,
    fetchingNext: query.isFetchingNextPage,
    /** Loading the next page failed; the list stays, and asking again is up to the user. */
    nextFailed: query.isFetchNextPageError,
    fetchNextPage: () => void query.fetchNextPage(),
  };
}

/** Calls `onReach` whenever the returned element comes into view while `enabled`. */
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
