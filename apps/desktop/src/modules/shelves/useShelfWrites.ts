import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NewShelf, ShelfOut, ShelfPatch } from '@bookeeper/api';
import { useClient } from '../../session';
import { useKeys } from './useShelves';

/** Creating, editing and deleting shelf units. Each write refreshes everything that shows shelves. */
export function useShelfWrites() {
  const client = useClient();
  const keys = useKeys();
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.shelves }),
      qc.invalidateQueries({ queryKey: ['books'] }),
      qc.invalidateQueries({ queryKey: ['stats'] }),
    ]);

  const create = useMutation<ShelfOut, unknown, NewShelf>({
    mutationFn: (body) => client.createShelf(body),
    onSuccess: refresh,
  });
  const update = useMutation<ShelfOut, unknown, { id: string; patch: ShelfPatch }>({
    mutationFn: ({ id, patch }) => client.updateShelf(id, patch),
    onSuccess: refresh,
  });
  const remove = useMutation<void, unknown, string>({
    mutationFn: (id) => client.deleteShelf(id),
    onSuccess: refresh,
  });
  return { create, update, remove };
}
