import { useEffect, useRef } from 'react';
import { useT } from '../../app/i18n';
import { BottomSheet } from '../../kit';
import { createBody, initialValues, type WishInitial } from './model';
import { useCreateWish } from './useWishlist';
import { WishForm } from './WishForm';

export interface AddWishSheetProps {
  /** Pre-filled fields, e.g. what a scan found. */
  initial?: WishInitial;
  /** The wish was added, or the sheet was dismissed and no `onCancel` was given. */
  onDone: () => void;
  /** Dismissed without adding; lets a caller go back to what it was showing. */
  onCancel?: () => void;
}

/** "Add to the wishlist": a sheet with the form, open while it is mounted. */
export function AddWishSheet({ initial, onDone, onCancel }: AddWishSheetProps) {
  const t = useT();
  const create = useCreateWish();
  const closed = useRef(false);
  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
    };
  }, []);
  return (
    <BottomSheet
      open
      onOpenChange={(open) => {
        if (open) return;
        closed.current = true;
        (onCancel ?? onDone)();
      }}
      title={t('mwishlist.add.title')}
    >
      <WishForm
        initial={initialValues(initial)}
        submitLabel={t('mwishlist.add.submit')}
        onSubmit={async (values) => {
          await create.mutateAsync(createBody(values));
          if (!closed.current) onDone();
        }}
      />
    </BottomSheet>
  );
}
