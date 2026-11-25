import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTag, PatchTag } from '@bookeeper/api';
import { useClient, useSession } from '../../session';

/** The tags of the library, by name, with the number of books of each. */
export function useTags() {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  return useQuery({
    queryKey: ['tags', connectionId],
    retry: false,
    queryFn: async () => (await client.listTags()).items,
  });
}

/** After a write: tags and their counts, books (list, detail), facets and statistics. */
export function useRefreshTags() {
  const queryClient = useQueryClient();
  const connectionId = useSession((s) => s.connection?.id);
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tags', connectionId] }),
      queryClient.invalidateQueries({ queryKey: ['books', connectionId] }),
      queryClient.invalidateQueries({ queryKey: ['facets'] }),
      queryClient.invalidateQueries({ queryKey: ['stats'] }),
    ]);
}

export function useTagWrites() {
  const client = useClient();
  const refresh = useRefreshTags();
  return {
    create: useMutation({ mutationFn: (body: CreateTag) => client.createTag(body), onSuccess: refresh }),
    update: useMutation({
      mutationFn: (v: { id: string; patch: PatchTag }) => client.updateTag(v.id, v.patch),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: string) => client.deleteTag(id), onSuccess: refresh }),
    setBookTags: useMutation({
      mutationFn: (v: { bookId: string; tagIds: string[] }) => client.setBookTags(v.bookId, v.tagIds),
      onSuccess: refresh,
    }),
  };
}
