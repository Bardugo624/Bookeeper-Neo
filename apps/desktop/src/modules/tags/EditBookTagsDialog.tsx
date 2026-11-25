import { useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { Dialog, useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { TagPicker } from './TagPicker';
import { sameSet } from './tagModel';
import { useTagWrites } from './useTags';
import styles from './dialogs.module.css';

export interface EditBookTagsDialogProps {
  book: BookOut;
  open: boolean;
  onClose(): void;
}

/** "Edit tags" of the book page: the picker, saved with `PUT /books/{id}/tags`. */
export function EditBookTagsDialog({ book, open, onClose }: EditBookTagsDialogProps) {
  // Mounted only while open, so every opening starts from the stored tags.
  return open ? <Editor book={book} onClose={onClose} /> : null;
}

function Editor({ book, onClose }: Omit<EditBookTagsDialogProps, 'open'>) {
  const t = useT();
  const toast = useToast();
  const { setBookTags } = useTagWrites();
  const [ids, setIds] = useState(() => book.tags.map((tag) => tag.id));
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (setBookTags.isPending) return;
    if (sameSet(ids, book.tags.map((tag) => tag.id))) return onClose();
    setError(null);
    setBookTags.mutate(
      { bookId: book.id, tagIds: ids },
      {
        onSuccess: () => {
          toast.show({ title: t('tags.toast.saved', { title: book.title }), tone: 'ok' });
          onClose();
        },
        onError: (e) => setError(apiErrorMessage(t, e)),
      },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !setBookTags.isPending) onClose();
      }}
      title={t('tags.edit.title')}
      description={book.title}
      closeLabel={t('common.close')}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" disabled={setBookTags.isPending} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={setBookTags.isPending} loadingLabel={t('common.saving')} onClick={save}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <div className={styles.body}>
        <TagPicker value={ids} onChange={setIds} disabled={setBookTags.isPending} />
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
