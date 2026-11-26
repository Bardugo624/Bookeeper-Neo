import { useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { TagChip } from './TagChips';
import { useAssignTags, type AssignMode, type AssignResult } from './useAssignTags';
import { useTags } from './useTags';
import styles from './dialogs.module.css';

export interface AssignTagsDialogProps {
  /** The selected books, with the tags they have now. */
  books: BookOut[];
  open: boolean;
  onClose(): void;
}

/** "Tag…" of the selection bar: adds or removes one tag on every selected book. */
export function AssignTagsDialog({ books, open, onClose }: AssignTagsDialogProps) {
  return open ? <Assigner books={books} onClose={onClose} /> : null;
}

function Summary({ result }: { result: AssignResult }) {
  const t = useT();
  return (
    <div role="status">
      <p className={styles.summary}>
        {t('tags.assign.done', { updated: result.updated, unchanged: result.unchanged, failed: result.failures.length })}
      </p>
      {result.failures.length > 0 ? (
        <>
          <p className={styles.note}>{t('tags.assign.failedTitle')}</p>
          <ul className={styles.failures}>
            {result.failures.map(({ book, message }) => (
              <li key={book.id}>{t('tags.assign.failure', { title: book.title, message })}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function Assigner({ books, onClose }: Omit<AssignTagsDialogProps, 'open'>) {
  const t = useT();
  const tags = useTags();
  const { run, progress, result } = useAssignTags();
  const [mode, setMode] = useState<AssignMode>('add');
  const [tagId, setTagId] = useState('');
  const running = progress !== null;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !running) onClose();
      }}
      title={t('tags.assign.title', { count: books.length })}
      closeLabel={t('common.close')}
      footer={
        <div className={styles.footer}>
          {result ? (
            <Button variant="primary" onClick={onClose}>
              {t('common.close')}
            </Button>
          ) : (
            <>
              <Button variant="ghost" disabled={running} onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                disabled={tagId === ''}
                loading={running}
                loadingLabel={t('tags.assign.working')}
                onClick={() => void run(books, tagId, mode)}
              >
                {t(mode === 'add' ? 'tags.assign.apply' : 'tags.assign.applyRemove', { count: books.length })}
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className={styles.body}>
        {result ? (
          <Summary result={result} />
        ) : (
          <>
            <fieldset className={styles.choices} disabled={running}>
              <legend className={styles.legend}>{t('tags.assign.action')}</legend>
              {(['add', 'remove'] as const).map((m) => (
                <label key={m} className={styles.choice}>
                  <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />
                  {t(`tags.assign.${m}`)}
                </label>
              ))}
            </fieldset>
            <fieldset className={styles.choices} disabled={running}>
              <legend className={styles.legend}>{t('tags.assign.tag')}</legend>
              {(tags.data ?? []).map((tag) => (
                <label key={tag.id} className={styles.choice}>
                  <input type="radio" name="tag" checked={tagId === tag.id} onChange={() => setTagId(tag.id)} />
                  <TagChip tag={tag} />
                </label>
              ))}
              {tags.isSuccess && tags.data.length === 0 ? <p className={styles.note}>{t('tags.assign.noTags')}</p> : null}
              {tags.isError ? <p className={styles.error}>{t('tags.manage.error')}</p> : null}
            </fieldset>
            {progress ? (
              <p role="status" className={styles.note}>
                {t('tags.assign.progress', { done: progress.done, total: progress.total })}
              </p>
            ) : null}
          </>
        )}
      </div>
    </Dialog>
  );
}
