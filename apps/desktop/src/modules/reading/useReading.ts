import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PutReading, ReadingOut } from '@bookeeper/api';
import { useClient, useSession } from '../../session';
import { optimisticReading } from './readingModel';

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

type Context = { previous: ReadingOut | null | undefined };

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
  // This write is still counted while its own callbacks run: more than one means a newer write is on its way.
  const superseded = () => queryClient.isMutating({ mutationKey }) > 1;
  return useMutation<ReadingOut, unknown, PutReading, Context>({
    mutationKey,
    mutationFn: (body) => client.setReading(bookId, body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ReadingOut | null>(key);
      queryClient.setQueryData<ReadingOut | null>(key, optimisticReading(bookId, body, pageCount));
      return { previous };
    },
    // The answer of a write that a newer one has passed must not undo what the screen shows already.
    onSuccess: (saved) => {
      if (!superseded()) queryClient.setQueryData<ReadingOut | null>(key, saved);
    },
    onError: (_error, _body, context) => {
      if (context && !superseded()) queryClient.setQueryData<ReadingOut | null>(key, context.previous ?? null);
    },
    onSettled: () => (superseded() ? undefined : refresh()),
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
