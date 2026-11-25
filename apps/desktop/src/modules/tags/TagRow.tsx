import { useState } from 'react';
import { ApiError, type TagOut } from '@bookeeper/api';
import { Button, Field, IconButton, Input } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { TagChip } from './TagChips';
import { TagColorPicker } from './TagColorPicker';
import { NAME_MAX, type TagColor } from './tagModel';
import { useTagWrites } from './useTags';
import styles from './dialogs.module.css';

export interface TagRowProps {
  tag: TagOut;
  /** Without write permission the row only reads. */
  canWrite: boolean;
  onDelete(tag: TagOut): void;
}

/** A tag of the management dialog: count of books, rename, color, delete. */
export function TagRow({ tag, canWrite, onDelete }: TagRowProps) {
  const t = useT();
  const { update } = useTagWrites();
  const [draft, setDraft] = useState(tag.name);
  const [error, setError] = useState<string | undefined>();
  const count = t('tags.manage.books', { count: tag.book_count });
  const name = draft.trim();
  const dirty = name !== tag.name;

  const patch = (body: { name?: string; color?: TagColor }) => {
    if (update.isPending) return;
    setError(undefined);
    update.mutate(
      { id: tag.id, patch: body },
      {
        onError: (e) =>
          setError(e instanceof ApiError && e.code === 'tag_exists' ? t('tags.errors.exists') : apiErrorMessage(t, e)),
      },
    );
  };

  const rename = () => {
    if (!dirty) return;
    if (name === '') return setError(t('common.required'));
    if (name.length > NAME_MAX) return setError(t('tags.errors.tooLong', { max: NAME_MAX }));
    patch({ name });
  };

  if (!canWrite) {
    return (
      <li className={styles.row}>
        <div className={styles.rowBottom}>
          <TagChip tag={tag} />
          <span className={styles.count}>{count}</span>
        </div>
      </li>
    );
  }
  return (
    <li className={styles.row}>
      <div className={styles.rowTop}>
        <div className={styles.grow}>
          <Field label={t('tags.manage.name', { name: tag.name })} error={error}>
            <Input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(undefined);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  rename();
                }
              }}
            />
          </Field>
        </div>
        {dirty ? (
          <Button
            variant="secondary"
            size="sm"
            aria-label={t('tags.manage.rename', { name: tag.name })}
            loading={update.isPending}
            loadingLabel={t('common.saving')}
            onClick={rename}
          >
            {t('common.save')}
          </Button>
        ) : null}
        <IconButton icon="trash" label={t('tags.manage.delete', { name: tag.name })} onClick={() => onDelete(tag)} />
      </div>
      <div className={styles.rowBottom}>
        <TagColorPicker
          value={tag.color}
          label={t('tags.manage.color', { name: tag.name })}
          disabled={update.isPending}
          onChange={(color) => color !== tag.color && patch({ color })}
        />
        <span className={styles.count}>{count}</span>
      </div>
    </li>
  );
}
