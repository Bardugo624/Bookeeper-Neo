import { useState } from 'react';
import type { TagOut } from '@bookeeper/api';
import { Button, Skeleton } from '@bookeeper/ui/base';
import { Dialog, useToast } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { ConfirmDialog, apiErrorMessage, usePermission } from '../../kit';
import { TagRow } from './TagRow';
import { useTags, useTagWrites } from './useTags';
import styles from './dialogs.module.css';

export interface ManageTagsDialogProps {
  open: boolean;
  onClose(): void;
}

/** Every tag of the library with its book count; rename, change color and delete need write access. */
export function ManageTagsDialog({ open, onClose }: ManageTagsDialogProps) {
  const t = useT();
  const toast = useToast();
  const canWrite = usePermission().can('write');
  const tags = useTags();
  const { remove } = useTagWrites();
  const [doomed, setDoomed] = useState<TagOut | null>(null);

  const confirm = () => {
    if (!doomed || remove.isPending) return;
    remove.mutate(doomed.id, {
      onSuccess: () => {
        toast.show({ title: t('tags.toast.deleted', { name: doomed.name }), tone: 'ok' });
        setDoomed(null);
      },
      onError: (e) => {
        setDoomed(null);
        toast.show({ title: apiErrorMessage(t, e), tone: 'danger' });
      },
    });
  };

  const items = tags.data ?? [];
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title={t('tags.manage.title')}
        closeLabel={t('common.close')}
        footer={
          <div className={styles.footer}>
            <Button variant="secondary" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        }
      >
        <div className={styles.body}>
          {tags.isPending ? (
            <div role="status" aria-label={t('tags.manage.loading')}>
              <Skeleton shape="line" width="100%" height={20} />
            </div>
          ) : tags.isError ? (
            <p role="alert" className={styles.error}>
              {t('tags.manage.error')}
            </p>
          ) : items.length === 0 ? (
            <p className={styles.note}>{t('tags.manage.empty')}</p>
          ) : (
            <ul className={styles.rows} aria-label={t('tags.manage.list')}>
              {items.map((tag) => (
                <TagRow key={tag.id} tag={tag} canWrite={canWrite} onDelete={setDoomed} />
              ))}
            </ul>
          )}
        </div>
      </Dialog>
      <ConfirmDialog
        open={doomed !== null}
        title={t('tags.delete.title', { name: doomed?.name ?? '' })}
        description={t('tags.delete.text', { name: doomed?.name ?? '', count: doomed?.book_count ?? 0 })}
        confirmLabel={t('common.delete')}
        tone="danger"
        busy={remove.isPending}
        onConfirm={confirm}
        onCancel={() => setDoomed(null)}
      />
    </>
  );
}
