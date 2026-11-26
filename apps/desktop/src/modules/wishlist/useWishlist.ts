import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookOut, CreateWish, PatchWish, WishList } from '@bookeeper/api';
import { useClient, useSession } from '../../session';

/** Wishlist queries and writes. Components never touch the client. */
export function useWishlist(scope: 'mine' | 'family' = 'mine') {
  const client = useClient();
  const connectionId = useSession((s) => s.connection?.id);
  const meId = useSession((s) => s.me?.user.id);
  const qc = useQueryClient();
  const key = ['wishlist', connectionId] as const;
  const listKey = [...key, 'list'] as const;
  const scopedKey = [...listKey, scope] as const;

  const query = useQuery({ queryKey: scopedKey, retry: false, queryFn: () => client.listWishlist(scope === 'family' ? { scope } : undefined) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: (body: CreateWish) => client.createWish(body),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchWish }) => client.updateWish(id, patch),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => client.deleteWish(id),
    onSuccess: (_, id) => {
      qc.setQueriesData<WishList>({ queryKey: listKey }, (cur) => cur && { items: cur.items.filter((w) => w.id !== id) });
      return refresh();
    },
  });
  const convert = useMutation<BookOut, Error, string>({
    mutationFn: (id) => client.convertWish(id),
    onSuccess: (_, id) => {
      qc.setQueriesData<WishList>({ queryKey: listKey }, (cur) => cur && { items: cur.items.filter((w) => w.id !== id) });
      // A new book changes the library and its numbers.
      void qc.invalidateQueries({ queryKey: ['books'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
      return refresh();
    },
  });

  return { meId, query, create, update, remove, convert };
}
