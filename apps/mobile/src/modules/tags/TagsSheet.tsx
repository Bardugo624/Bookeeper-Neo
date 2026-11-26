import type { BookOut } from '@bookeeper/api';
import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { BottomSheet, apiErrorMessage } from '../../kit';
import { colorOf } from './tagModel';
import { useTagsEditor } from './useTagsEditor';
import styles from './Tags.module.css';
import type { CSSProperties } from 'react';

/** The tags of the library as check boxes, a filter field and "Create «text»"; "Save" sends once. */
export function TagsSheet({ book, onClose }: { book: BookOut; onClose: () => void }) {
  const t = useT();
  const ed = useTagsEditor(book, onClose);
  const { tags } = ed;
  return (
    <BottomSheet
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t('mtags.sheet.title')}
      footer={
        <button type="button" className={styles.primary} disabled={ed.busy || tags.isPending || tags.isError} onClick={() => void ed.save()}>
          {t('mtags.sheet.save')}
        </button>
      }
    >
      <div className={styles.sheet}>
        <input
          type="search"
          className={styles.input}
          aria-label={t('mtags.sheet.filter')}
          placeholder={t('mtags.sheet.filter')}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={40}
          value={ed.filter}
          onChange={(e) => ed.setFilter(e.target.value)}
        />
        {tags.isPending ? <p className={styles.plain}>{t('mtags.sheet.loading')}</p> : null}
        {tags.isError ? (
          <>
            <p role="alert" className={styles.error}>
              {t('mtags.sheet.loadError')} {apiErrorMessage(t, tags.error)}
            </p>
            <button type="button" className={styles.button} onClick={() => void tags.refetch()}>
              {t('mtags.sheet.retry')}
            </button>
          </>
        ) : null}
        <ul className={styles.options} aria-label={t('mtags.sheet.list')}>
          {ed.shown.map((tag) => {
            const on = ed.selected.includes(tag.id);
            return (
              <li key={tag.id}>
                <label className={styles.option} style={{ '--tag-color': colorOf(tag.color) } as CSSProperties}>
                  <input type="checkbox" className={styles.check} checked={on} onChange={() => ed.toggle(tag.id)} />
                  <span className={styles.dot} aria-hidden="true" />
                  <span className={styles.name}>{tag.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
        {ed.canCreate ? (
          <button type="button" className={styles.button} disabled={ed.busy} onClick={() => void ed.add()}>
            <Icon name="plus" size={16} />
            {t('mtags.sheet.create', { name: ed.filter.trim() })}
          </button>
        ) : null}
        {!tags.isPending && !tags.isError && ed.shown.length === 0 && !ed.canCreate ? (
          <p className={styles.plain}>{t('mtags.sheet.empty')}</p>
        ) : null}
        {ed.error ? (
          <p role="alert" className={styles.error}>
            {ed.error}
          </p>
        ) : null}
      </div>
    </BottomSheet>
  );
}
