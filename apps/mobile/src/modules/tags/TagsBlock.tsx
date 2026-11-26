import { useId, useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { useSession } from '../../session';
import { TagChip } from './TagChip';
import { TagsSheet } from './TagsSheet';
import { canEditTags } from './tagModel';
import styles from './Tags.module.css';

/** "Tags" block of the book page: the labels, and for who may write books, a sheet to change them. */
export function TagsBlock({ book }: { book: BookOut }) {
  const t = useT();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const canEdit = useSession((s) => canEditTags(s.me?.user.role));
  const tags = book.tags ?? [];
  if (tags.length === 0 && !canEdit) return null;
  return (
    <section className={styles.block} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.heading}>
        <Icon name="list" size={16} />
        {t('mtags.title')}
      </h2>
      {tags.length > 0 ? (
        <ul className={styles.list}>
          {tags.map((tag) => (
            <li key={tag.id}>
              <TagChip tag={tag} />
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.plain}>{t('mtags.none')}</p>
      )}
      {canEdit ? (
        <button type="button" className={styles.button} onClick={() => setOpen(true)}>
          {t('mtags.edit')}
        </button>
      ) : null}
      {open ? <TagsSheet book={book} onClose={() => setOpen(false)} /> : null}
    </section>
  );
}
