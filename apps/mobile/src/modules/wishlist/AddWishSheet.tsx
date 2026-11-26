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
  return (
    <BottomSheet
      open
      onOpenChange={(open) => (open ? undefined : (onCancel ?? onDone)())}
      title={t('mwishlist.add.title')}
    >
      <WishForm
        initial={initialValues(initial)}
        submitLabel={t('mwishlist.add.submit')}
        onSubmit={async (values) => {
          await create.mutateAsync(createBody(values));
          onDone();
        }}
      />
    </BottomSheet>
  );
}
