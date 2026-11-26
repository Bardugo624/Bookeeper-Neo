import { useState } from 'react';
import { useNavigate, type To } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { Button, DangerAction, DangerZone } from '@bookeeper/ui/base';
import { useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { ConfirmDialog, apiErrorMessage } from '../../kit';
import { useBookWrites } from './useBookWrites';
import styles from './BookDangerZone.module.css';

/** Foot of the book page: deleting the book, with what goes away along with it. */
export function BookDangerZone({ book, listPath }: { book: BookOut; listPath: To }) {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { remove } = useBookWrites();
  const [confirming, setConfirming] = useState(false);

  const confirm = () => {
    if (remove.isPending) return;
    remove.mutate(book.id, {
      onSuccess: () => {
        toast.show({ title: t('books.toast.deleted', { title: book.title }), tone: 'ok' });
        void navigate(listPath);
      },
      onError: (error) => {
        setConfirming(false);
        toast.show({ title: apiErrorMessage(t, error), tone: 'danger' });
      },
    });
  };

  return (
    <div className={styles.zone}>
      <DangerZone title={t('books.danger.title')} headingLevel="h2">
        <DangerAction
          title={t('books.danger.delete.title')}
          consequence={t('books.danger.delete.consequence')}
          action={
            <Button variant="danger" onClick={() => setConfirming(true)}>
              {t('books.danger.delete.title')}
            </Button>
          }
        />
      </DangerZone>
      <ConfirmDialog
        open={confirming}
        title={t('books.delete.title', { title: book.title })}
        description={t('books.delete.text', { title: book.title })}
        confirmLabel={t('common.delete')}
        tone="danger"
        busy={remove.isPending}
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
