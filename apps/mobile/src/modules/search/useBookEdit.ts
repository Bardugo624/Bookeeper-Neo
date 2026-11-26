import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookOut, PatchBook, PersonOut, Reader } from '@bookeeper/api';
import { useClient, useSession } from '../../session';

/** The people of the library, for the "Di chi è" choice. */
export function usePeople(enabled = true) {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery<PersonOut[]>({
    queryKey: ['people', libraryId],
    enabled,
    retry: false,
    queryFn: async () => (await client.listUsers()).items,
  });
}

/** Who of the family has a reading state on the book. A failure only hides the block. */
export function useReaders(bookId: string): Reader[] {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  const { data } = useQuery({
    queryKey: ['readers', libraryId, bookId],
    retry: false,
    queryFn: async () => (await client.listReaders(bookId)).items,
  });
  return data ?? [];
}

/** `PATCH /books/{id}`; afterwards books (list, detail), facets, readers and people are stale. */
export function useUpdateBook(id: string) {
  const client = useClient();
  const queryClient = useQueryClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useMutation<BookOut, unknown, PatchBook>({
    mutationFn: (patch) => client.updateBook(id, patch),
    onSuccess: async (saved) => {
      queryClient.setQueryData(['books', libraryId, 'detail', id], saved);
      await Promise.all(
        [['books', libraryId], ['facets'], ['readers', libraryId], ['people', libraryId], ['me']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}
