import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useClient, useSession } from '../../session';
import type { SearchState } from './searchState';

/** Counts of the library to filter by. Writes invalidate the `facets` key. */
export function useFacets(enabled = true) {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({
    queryKey: ['facets', libraryId],
    enabled,
    retry: false,
    staleTime: 30_000,
    queryFn: () => client.getBookFacets(),
  });
}

/** The rooms of the library, by name. */
export function useRooms(enabled = true) {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({
    queryKey: ['rooms', libraryId],
    enabled,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => (await client.listRooms()).items,
  });
}

/** How many books the list would show with `draft` in place of the applied filters; `undefined` while unknown. */
export function useDraftCount(draft: SearchState, enabled: boolean): number | undefined {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  const q = draft.q.trim();
  const params = {
    q: q || undefined,
    on_loan: draft.filter === 'loan' ? true : undefined,
    unshelved: draft.filter === 'unshelved' ? true : undefined,
    reading: draft.reading ?? undefined,
    tag_id: draft.tags.length > 0 ? draft.tags : undefined,
    room_id: draft.room ?? undefined,
  };
  const query = useQuery({
    queryKey: ['books', libraryId, 'count', params],
    enabled,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: () => client.listBooks({ ...params, limit: 1, offset: 0 }),
  });
  return query.isPlaceholderData ? undefined : query.data?.total;
}
