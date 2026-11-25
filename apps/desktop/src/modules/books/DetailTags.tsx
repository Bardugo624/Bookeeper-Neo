import { useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { usePermission } from '../../kit';
import { EditBookTagsDialog, TagChips } from '../tags';
import styles from './DetailAside.module.css';

/** The tags of the book, each leading to the list filtered by it; "Edit tags" for those who can write. */
export function DetailTags({ book }: { book: BookOut }) {
  const t = useT();
  const canWrite = usePermission().can('write');
  const [editing, setEditing] = useState(false);
  return (
    <section className={styles.card} aria-labelledby="book-tags">
      <h2 id="book-tags" className={styles.heading}>
        {t('tags.detail.title')}
      </h2>
      {book.tags.length > 0 ? (
        <TagChips tags={book.tags} label={t('tags.detail.list')} />
      ) : (
        <p className={styles.note}>{t('tags.detail.none')}</p>
      )}
      {canWrite ? (
        <>
          <div className={styles.action}>
            <Button variant="secondary" size="sm" icon="pencil" onClick={() => setEditing(true)}>
              {t('tags.detail.edit')}
            </Button>
          </div>
          <EditBookTagsDialog book={book} open={editing} onClose={() => setEditing(false)} />
        </>
      ) : null}
    </section>
  );
}
