import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookOut, CreateWish, PatchWish, WishOut } from '@bookeeper/api';
import { useClient, useSession } from '../../session';
import type { Scope } from './model';

/** The wishes of the caller (`mine`) or of the whole family. */
export function useWishlist(scope: Scope) {
  const client = useClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return useQuery({
    queryKey: ['wishlist', libraryId, scope],
    retry: false,
    queryFn: async () => (await client.listWishlist(scope === 'family' ? { scope } : undefined)).items,
  });
}

/** After a write: the wishlists, and (a conversion makes a book) books, facets and statistics. */
function useRefresh() {
  const queryClient = useQueryClient();
  const libraryId = useSession((s) => s.me?.library.id);
  return (books: boolean) =>
    Promise.all(
      [['wishlist', libraryId], ...(books ? [['books', libraryId], ['facets'], ['stats']] : [])].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export function useCreateWish() {
  const client = useClient();
  const refresh = useRefresh();
  return useMutation<WishOut, unknown, CreateWish>({
    mutationFn: (body) => client.createWish(body),
    onSuccess: () => refresh(false),
  });
}

export function useUpdateWish() {
  const client = useClient();
  const refresh = useRefresh();
  return useMutation<WishOut, unknown, { id: string; patch: PatchWish }>({
    mutationFn: ({ id, patch }) => client.updateWish(id, patch),
    onSuccess: () => refresh(false),
  });
}

export function useDeleteWish() {
  const client = useClient();
  const refresh = useRefresh();
  return useMutation<void, unknown, string>({
    mutationFn: (id) => client.deleteWish(id),
    onSuccess: () => refresh(false),
  });
}

export function useConvertWish() {
  const client = useClient();
  const refresh = useRefresh();
  return useMutation<BookOut, unknown, string>({
    mutationFn: (id) => client.convertWish(id),
    onSuccess: () => refresh(true),
  });
}
