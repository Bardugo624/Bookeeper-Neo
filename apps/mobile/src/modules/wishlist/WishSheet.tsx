import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { WishOut } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { BottomSheet, apiErrorMessage } from '../../kit';
import { patchBody, valuesOf } from './model';
import { useConvertWish, useDeleteWish, useUpdateWish } from './useWishlist';
import { WishForm } from './WishForm';
import styles from './Wishlist.module.css';

type Step = 'actions' | 'edit' | 'delete';

/** What can be done with one of the caller's wishes: edit, delete (after a confirmation), or "I have it". */
export function WishSheet({ wish, onClose }: { wish: WishOut; onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('actions');
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateWish();
  const remove = useDeleteWish();
  const convert = useConvertWish();
  const busy = update.isPending || remove.isPending || convert.isPending;

  const run = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(apiErrorMessage(t, e));
    }
  };

  const doConvert = () =>
    run(async () => {
      const book = await convert.mutateAsync(wish.id);
      onClose();
      void navigate(`/books/${encodeURIComponent(book.id)}`);
    });
  const doDelete = () =>
    run(async () => {
      await remove.mutateAsync(wish.id);
      onClose();
    });

  const goTo = (next: Step) => {
    setError(null);
    setStep(next);
  };
  const back = () => goTo('actions');

  let body;
  if (step === 'edit') {
    body = (
      <WishForm
        initial={valuesOf(wish)}
        submitLabel={t('mwishlist.edit.submit')}
        onSubmit={async (values) => {
          await update.mutateAsync({ id: wish.id, patch: patchBody(values) });
          onClose();
        }}
      />
    );
  } else if (step === 'delete') {
    body = (
      <div className={styles.actions}>
        <p className={styles.text}>{t('mwishlist.delete.text', { title: wish.title })}</p>
        <Button variant="danger" onClick={() => void doDelete()} loading={remove.isPending} loadingLabel={t('mwishlist.delete.working')}>
          {t('mwishlist.delete.confirm')}
        </Button>
        <Button variant="secondary" onClick={back} disabled={busy}>
          {t('mwishlist.delete.cancel')}
        </Button>
      </div>
    );
  } else {
    body = (
      <div className={styles.actions}>
        <Button variant="primary" icon="check" onClick={() => void doConvert()} loading={convert.isPending} loadingLabel={t('mwishlist.convert.working')}>
          {t('mwishlist.convert.button')}
        </Button>
        <Button variant="secondary" icon="pencil" onClick={() => goTo('edit')} disabled={busy}>
          {t('mwishlist.edit.button')}
        </Button>
        <Button variant="danger" icon="trash" onClick={() => goTo('delete')} disabled={busy}>
          {t('mwishlist.delete.button')}
        </Button>
      </div>
    );
  }

  return (
    <BottomSheet
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={step === 'edit' ? t('mwishlist.edit.title') : wish.title}
      description={step === 'actions' && wish.authors ? wish.authors : undefined}
    >
      {body}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </BottomSheet>
  );
}
