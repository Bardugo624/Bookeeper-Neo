import { useState } from 'react';
import { Button, IconButton, Input } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { MAX_NAME, type SavedView } from './useSavedViews';
import styles from './ManageViewsDialog.module.css';

export interface ManageViewsDialogProps {
  open: boolean;
  views: SavedView[];
  onRename(id: string, name: string): void;
  onRemove(id: string): void;
  onClose(): void;
}

/** The saved views with rename and delete. */
export function ManageViewsDialog({ open, views, onRename, onRemove, onClose }: ManageViewsDialogProps) {
  const t = useT();
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const commit = () => {
    if (editing && editing.name.trim()) onRename(editing.id, editing.name);
    setEditing(null);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setEditing(null);
          onClose();
        }
      }}
      title={t('books.views.manageTitle')}
      closeLabel={t('common.close')}
    >
      {views.length === 0 ? <p className={styles.empty}>{t('books.views.none')}</p> : null}
      <ul className={styles.list}>
        {views.map((v) => (
          <li key={v.id} className={styles.row}>
            {editing?.id === v.id ? (
              <form
                className={styles.edit}
                onSubmit={(e) => {
                  e.preventDefault();
                  commit();
                }}
              >
                <Input
                  aria-label={t('books.views.name')}
                  value={editing.name}
                  maxLength={MAX_NAME}
                  autoFocus
                  onChange={(e) => setEditing({ id: v.id, name: e.target.value })}
                />
                <Button type="submit" variant="primary" size="sm">
                  {t('common.save')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                  {t('common.cancel')}
                </Button>
              </form>
            ) : (
              <>
                <span className={styles.name}>{v.name}</span>
                <IconButton icon="pencil" label={t('books.views.rename', { name: v.name })} onClick={() => setEditing({ id: v.id, name: v.name })} />
                <IconButton icon="trash" label={t('books.views.delete', { name: v.name })} onClick={() => onRemove(v.id)} />
              </>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
