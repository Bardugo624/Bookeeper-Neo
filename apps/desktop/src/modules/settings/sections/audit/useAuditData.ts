import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ApiError } from '@bookeeper/api';
import { useClient, useSession } from '../../../../session';
import { PAGE_SIZE, queryParams, type AuditFilters } from './auditModel';

/** Root of every query of this section. */
export function useAuditKey(): readonly ['audit', string | undefined] {
  const connectionId = useSession((s) => s.connection?.id);
  return ['audit', connectionId];
}

/** The log for a filter, newest first, in pages of 50. */
export function useAuditList(filters: AuditFilters) {
  const client = useClient();
  const key = useAuditKey();
  const params = queryParams(filters);
  const query = useInfiniteQuery({
    queryKey: [...key, 'list', params],
    initialPageParam: 0,
    retry: false,
    queryFn: ({ pageParam }) => client.listAudit({ ...params, limit: PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return last.items.length > 0 && loaded < last.total ? loaded : undefined;
    },
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return {
    items,
    total: query.data?.pages[0]?.total ?? 0,
    isPending: query.isPending,
    isError: query.isError,
    forbidden: query.error instanceof ApiError && query.error.status === 403,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    retry: () => void query.refetch(),
  };
}

export interface Option {
  value: string;
  label: string;
}

/** What the filters can pick: the actions present in the log, the people and the devices of the library. */
export function useAuditOptions() {
  const client = useClient();
  const key = useAuditKey();
  const actions = useQuery({ queryKey: [...key, 'actions'], retry: false, queryFn: () => client.listAuditActions() });
  const devices = useQuery({ queryKey: [...key, 'devices'], retry: false, queryFn: () => client.listDevices() });
  const people = new Map<string, string>();
  const named: Option[] = [];
  for (const d of devices.data?.devices ?? []) {
    if (!people.has(d.user_id)) people.set(d.user_id, d.user_name);
    named.push({ value: d.id, label: d.name });
  }
  return {
    actions: actions.data?.items ?? [],
    people: [...people].map(([value, label]) => ({ value, label })),
    devices: named,
  };
}

/** The book an entry is about, as long as it still exists. */
export function useAuditBook(bookId: string | undefined) {
  const client = useClient();
  const key = useAuditKey();
  const query = useQuery({
    queryKey: [...key, 'book', bookId],
    enabled: !!bookId,
    retry: false,
    staleTime: 60_000,
    queryFn: () => client.getBook(bookId!),
  });
  return {
    book: query.data ? { id: query.data.id, title: query.data.title } : undefined,
    /** The book was looked up and is not there (or could not be read), as opposed to still loading. */
    gone: !!bookId && !query.data && !query.isPending,
  };
}
