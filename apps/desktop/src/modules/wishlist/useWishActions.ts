import { useCallback, useState } from 'react';
import type { WishOut } from '@bookeeper/api';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { createBody, patchBody, type WishValues } from './model';
import { useWishlist } from './useWishlist';

export type Dialog = { kind: 'form'; wish?: WishOut } | { kind: 'delete'; wish: WishOut } | null;

/** Dialog state and the write actions of the list, with one place for the error banner. */
export function useWishActions() {
  const t = useT();
  const { create, update, remove, convert } = useWishlist();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const [converted, setConverted] = useState<{ bookId: string; title: string } | null>(null);
  const dismissConverted = useCallback(() => setConverted(null), []);

  const save = async (wish: WishOut | undefined, v: WishValues) => {
    if (wish) await update.mutateAsync({ id: wish.id, patch: patchBody(v) });
    else await create.mutateAsync(createBody(v));
  };

  const confirmDelete = async (wish: WishOut) => {
    try {
      await remove.mutateAsync(wish.id);
    } catch (e) {
      setError(apiErrorMessage(t, e));
    }
    setDialog(null);
  };

  const convertWish = async (wish: WishOut) => {
    if (convert.isPending) return;
    setError(null);
    try {
      const book = await convert.mutateAsync(wish.id);
      setConverted({ bookId: book.id, title: book.title });
    } catch (e) {
      setError(apiErrorMessage(t, e));
    }
  };

  return {
    dialog,
    setDialog,
    error,
    converted,
    dismissConverted,
    save,
    confirmDelete,
    convertWish,
    deleting: remove.isPending,
    convertingId: convert.isPending ? convert.variables : undefined,
  };
}
