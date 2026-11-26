import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { WishOut } from '@bookeeper/api';
import { Button, DangerAction, DangerZone } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
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

  const run = async (work: () => Promise<unknown>, failed: string) => {
    if (busy) return;
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(`${failed} ${apiErrorMessage(t, e)}`);
    }
  };

  const doConvert = () =>
    run(async () => {
      const book = await convert.mutateAsync(wish.id);
      onClose();
      void navigate(`/books/${encodeURIComponent(book.id)}`);
    }, t('mwishlist.errors.convert'));
  const doDelete = () =>
    run(async () => {
      await remove.mutateAsync(wish.id);
      onClose();
    }, t('mwishlist.errors.delete'));

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
  } else {
    body = (
      <div className={styles.actions}>
        <Button variant="primary" icon="check" onClick={() => void doConvert()} loading={convert.isPending} loadingLabel={t('mwishlist.convert.working')}>
          {t('mwishlist.convert.button')}
        </Button>
        <Button variant="secondary" icon="pencil" onClick={() => goTo('edit')} disabled={busy}>
          {t('mwishlist.edit.button')}
        </Button>
        <DangerZone title={t('mwishlist.danger.title')}>
          <DangerAction
            title={t('mwishlist.danger.delete')}
            consequence={t('mwishlist.danger.consequence')}
            action={
              <Button variant="danger" icon="trash" className={styles.touch} onClick={() => goTo('delete')} disabled={busy}>
                {t('mwishlist.delete.button')}
              </Button>
            }
          />
        </DangerZone>
      </div>
    );
  }

  if (step === 'delete') {
    return (
      <Dialog
        open
        tone="danger"
        onOpenChange={(open) => (open ? undefined : back())}
        title={t('mwishlist.delete.title')}
        description={t('mwishlist.delete.text', { title: wish.title })}
        closeLabel={t('mobile.close')}
        footer={
          <>
            <Button variant="secondary" className={styles.touch} onClick={back} disabled={busy}>
              {t('mwishlist.delete.cancel')}
            </Button>
            <Button variant="danger" className={styles.touch} onClick={() => void doDelete()} loading={remove.isPending} loadingLabel={t('mwishlist.delete.working')}>
              {t('mwishlist.delete.confirm')}
            </Button>
          </>
        }
      >
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </Dialog>
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
