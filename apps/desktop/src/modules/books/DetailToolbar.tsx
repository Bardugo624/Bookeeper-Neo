import { useState } from 'react';
import { useNavigate, type To } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { Button, IconButton } from '@bookeeper/ui/base';
import { Menu, useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { ConfirmDialog, apiErrorMessage } from '../../kit';
import { BookDrawer } from './BookDrawer';
import { useBookWrites } from './useBookWrites';
import styles from './DetailToolbar.module.css';

/** "Edit" and the "More" menu (Delete) of the book page, with their dialogs. */
export function DetailToolbar({ book, listPath }: { book: BookOut; listPath: To }) {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const { remove } = useBookWrites();
  const [editing, setEditing] = useState(false);
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
    <div className={styles.toolbar}>
      <Button variant="secondary" icon="pencil" onClick={() => setEditing(true)}>
        {t('common.edit')}
      </Button>
      <Menu
        trigger={<IconButton icon="more" label={t('books.detail.more')} />}
        items={[
          { id: 'delete', label: t('common.delete'), icon: 'trash', danger: true, onSelect: () => setConfirming(true) },
        ]}
      />
      <BookDrawer open={editing} book={book} onClose={() => setEditing(false)} />
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
