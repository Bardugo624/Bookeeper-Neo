import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookOut, TagOut } from '@bookeeper/api';
import { useClient, useSession } from '../../session';

/** The tags of the library, by name. */
export function useTags(enabled = true) {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({
    queryKey: ['tags', libraryId],
    enabled,
    retry: false,
    queryFn: async () => (await client.listTags()).items,
  });
}

/** After a write: tags, books (list, detail), facets and statistics. */
function useRefresh() {
  const queryClient = useQueryClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return () =>
    Promise.all(
      [['tags', libraryId], ['books', libraryId], ['facets'], ['stats']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

export function useCreateTag() {
  const client = useClient();
  const refresh = useRefresh();
  return useMutation<TagOut, unknown, { name: string; color: string }>({
    mutationFn: (body) => client.createTag(body),
    onSuccess: refresh,
  });
}

/** Replaces the tags of one book with the final set: one request. */
export function useSetBookTags(bookId: string) {
  const client = useClient();
  const refresh = useRefresh();
  return useMutation<BookOut, unknown, string[]>({
    mutationFn: (ids) => client.setBookTags(bookId, ids),
    onSuccess: refresh,
  });
}
