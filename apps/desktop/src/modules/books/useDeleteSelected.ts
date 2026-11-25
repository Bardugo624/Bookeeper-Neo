import { useState } from 'react';
import { useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { DeleteStopped, useBookWrites } from './useBookWrites';

/** Confirmation and batch delete for the selection; the toast says what was and was not deleted. */
export function useDeleteSelected(selected: ReadonlySet<string>, onDone: () => void) {
  const t = useT();
  const toast = useToast();
  const { removeMany } = useBookWrites();
  const [confirming, setConfirming] = useState(false);
  return {
    confirming,
    busy: removeMany.isPending,
    ask: () => setConfirming(true),
    cancel: () => setConfirming(false),
    confirm: () => {
      if (removeMany.isPending) return;
      removeMany.mutate([...selected], {
        onSuccess: ({ requested, deleted }) => {
          setConfirming(false);
          onDone();
          if (deleted === requested) toast.show({ title: t('books.selection.deleted', { count: deleted }), tone: 'ok' });
          else
            toast.show({
              title: t('books.selection.partial', { deleted, total: requested }),
              description: t('books.selection.notDeleted', { count: requested - deleted }),
              tone: 'warn',
            });
        },
        onError: (error) => {
          setConfirming(false);
          if (error instanceof DeleteStopped && error.deleted > 0) {
            // Some blocks went through: those books are gone, so the selection ends too.
            onDone();
            toast.show({
              title: t('books.selection.partial', { deleted: error.deleted, total: error.requested }),
              description: apiErrorMessage(t, error.cause),
              tone: 'warn',
            });
            return;
          }
          toast.show({ title: apiErrorMessage(t, error instanceof DeleteStopped ? error.cause : error), tone: 'danger' });
        },
      });
    },
  };
}
