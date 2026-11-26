import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '@bookeeper/ui/overlays';
import type { WishOut } from '@bookeeper/api';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { createBody, patchBody, type WishValues } from './model';
import { useWishlist } from './useWishlist';

export type Dialog = { kind: 'form'; wish?: WishOut } | { kind: 'delete'; wish: WishOut; fromForm?: boolean } | null;

/** Dialog state and the write actions of the list, with one place for the error banner. */
export function useWishActions() {
  const t = useT();
  const { create, update, remove, convert } = useWishlist('mine', false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const navigate = useNavigate();

  const save = async (wish: WishOut | undefined, v: WishValues) => {
    setError(null);
    if (wish) await update.mutateAsync({ id: wish.id, patch: patchBody(v) });
    else await create.mutateAsync(createBody(v));
  };

  const confirmDelete = async (wish: WishOut) => {
    setError(null);
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
      toast.show({
        title: t('wishlist.converted.title'),
        description: book.title,
        tone: 'ok',
        action: { label: t('wishlist.converted.open'), onClick: () => void navigate(`/books/${encodeURIComponent(book.id)}`) },
      });
    } catch (e) {
      setError(apiErrorMessage(t, e));
    }
  };

  return {
    dialog,
    setDialog,
    error,
    save,
    confirmDelete,
    convertWish,
    deleting: remove.isPending,
    convertingId: convert.isPending ? convert.variables : undefined,
  };
}
