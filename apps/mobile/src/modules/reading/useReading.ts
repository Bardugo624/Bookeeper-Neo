import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PutReading, ReadingOut } from '@bookeeper/api';
import { useClient, useSession } from '../../session';
import { optimisticReading } from './readingModel';

type Cached = ReadingOut | null | undefined;
type Context = { previous: Cached; seq: number };

/** Writes started and still unanswered, per cached state: only the newest one may touch the screen. */
const started = new Map<string, number>();
const pending = new Map<string, number>();

function useScope(bookId: string) {
  const libraryId = useSession((s) => s.me?.library.id);
  return { libraryId, key: ['reading', libraryId, bookId] as const };
}

export function useReading(bookId: string) {
  const client = useClient();
  const { key } = useScope(bookId);
  return useQuery({ queryKey: key, retry: false, queryFn: () => client.getReading(bookId) });
}

/**
 * Optimistic write with ordering: a refusal or an answer of a write that was overtaken by a newer
 * one is dropped, and the queries are refreshed only when no write is left in flight.
 */
function useWrite<V>(bookId: string, send: (value: V) => Promise<ReadingOut | void>, next: (value: V, previous: Cached) => Cached) {
  const queryClient = useQueryClient();
  const { libraryId, key } = useScope(bookId);
  const id = key.join('/');
  const refresh = () =>
    Promise.all(
      [['reading', libraryId], ['books', libraryId], ['facets'], ['stats']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  const latest = (context: Context | undefined) => context !== undefined && context.seq === started.get(id);
  return useMutation<ReadingOut | void, unknown, V, Context>({
    mutationFn: send,
    onMutate: async (value) => {
      await queryClient.cancelQueries({ queryKey: key });
      const seq = (started.get(id) ?? 0) + 1;
      started.set(id, seq);
      pending.set(id, (pending.get(id) ?? 0) + 1);
      const previous = queryClient.getQueryData<Cached>(key);
      queryClient.setQueryData<Cached>(key, next(value, previous));
      return { previous, seq };
    },
    onSuccess: (saved, _value, context) => {
      if (saved && latest(context)) queryClient.setQueryData<Cached>(key, saved);
    },
    onError: (_error, _value, context) => {
      if (context && latest(context)) queryClient.setQueryData<Cached>(key, context.previous ?? null);
    },
    onSettled: () => {
      const left = (pending.get(id) ?? 1) - 1;
      if (left > 0) pending.set(id, left);
      else {
        pending.delete(id);
        void refresh();
      }
    },
  });
}

/** Replaces the caller's state. Every caller holds its own mutation, so a field shows its own failure. */
export function useSetReading(bookId: string, pageCount?: number | null) {
  const client = useClient();
  return useWrite<PutReading>(
    bookId,
    (body) => client.setReading(bookId, body),
    (body) => optimisticReading(bookId, body, pageCount),
  );
}

export function useClearReading(bookId: string) {
  const client = useClient();
  return useWrite<void>(
    bookId,
    () => client.clearReading(bookId),
    () => null,
  );
}
