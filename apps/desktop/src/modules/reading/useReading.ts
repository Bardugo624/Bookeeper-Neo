import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PutReading, ReadingOut } from '@bookeeper/api';
import { useClient, useSession } from '../../session';
import { optimisticReading } from './readingModel';

/** Order number of the last write started, per connection and book: an answer counts only if no later write started. */
const lastWrite = new Map<string, number>();

export function useReading(bookId: string) {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  return useQuery({
    queryKey: ['reading', connectionId, bookId],
    retry: false,
    queryFn: () => client.getReading(bookId),
  });
}

/** After a write: the books (list, detail, counts), facets and statistics all show the state. */
function useRefreshReading() {
  const queryClient = useQueryClient();
  const connectionId = useSession((s) => s.connection?.id);
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['reading', connectionId] }),
      queryClient.invalidateQueries({ queryKey: ['books', connectionId] }),
      queryClient.invalidateQueries({ queryKey: ['facets'] }),
      queryClient.invalidateQueries({ queryKey: ['stats'] }),
      queryClient.invalidateQueries({ queryKey: ['reading-stats'] }),
    ]);
}

type Context = { previous: ReadingOut | null | undefined; order?: number };

/**
 * Replaces the caller's state. The screen changes before the answer; an error puts the old state back.
 * Every caller holds its own mutation, so a failure is shown by the field that caused it.
 */
export function useSetReading(bookId: string, pageCount?: number | null) {
  const client = useClient();
  const queryClient = useQueryClient();
  const connectionId = useSession((s) => s.connection?.id);
  const refresh = useRefreshReading();
  const key = ['reading', connectionId, bookId];
  const mutationKey = ['reading-set', connectionId, bookId];
  const orderKey = JSON.stringify(mutationKey);
  // Every write gets a growing number; an answer is applied only while no write with a higher number has started.
  const superseded = (order: number | undefined) => (lastWrite.get(orderKey) ?? 0) > (order ?? 0);
  return useMutation<ReadingOut, unknown, PutReading, Context>({
    mutationKey,
    mutationFn: (body) => client.setReading(bookId, body),
    onMutate: async (body) => {
      const order = (lastWrite.get(orderKey) ?? 0) + 1;
      lastWrite.set(orderKey, order);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ReadingOut | null>(key);
      queryClient.setQueryData<ReadingOut | null>(key, optimisticReading(bookId, body, pageCount));
      return { previous, order };
    },
    // The answer of a write that a newer one has passed must not undo what the screen shows already.
    onSuccess: (saved, _body, context) => {
      if (!superseded(context?.order)) queryClient.setQueryData<ReadingOut | null>(key, saved);
    },
    onError: (_error, _body, context) => {
      if (context && !superseded(context.order)) queryClient.setQueryData<ReadingOut | null>(key, context.previous ?? null);
    },
    onSettled: (_data, _error, _body, context) => (superseded(context?.order) ? undefined : refresh()),
  });
}

export function useClearReading(bookId: string) {
  const client = useClient();
  const queryClient = useQueryClient();
  const connectionId = useSession((s) => s.connection?.id);
  const refresh = useRefreshReading();
  const key = ['reading', connectionId, bookId];
  return useMutation<void, unknown, void, Context>({
    mutationFn: () => client.clearReading(bookId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ReadingOut | null>(key);
      queryClient.setQueryData<ReadingOut | null>(key, null);
      return { previous };
    },
    onError: (_error, _v, context) => {
      if (context) queryClient.setQueryData<ReadingOut | null>(key, context.previous ?? null);
    },
    onSettled: refresh,
  });
}
