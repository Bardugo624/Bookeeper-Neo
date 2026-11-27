import type { BookOut } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { useState } from 'react';
import { useT } from '../../app';
import { ConfirmDialog } from '../../kit';
import { LabelsDialog } from '../labels';
import { AssignTagsDialog } from '../tags';
import { useDeleteSelected } from './useDeleteSelected';
import styles from './SelectionBar.module.css';

export interface SelectionBarProps {
  selected: ReadonlySet<string>;
  /** The selected books as loaded, with their tags. */
  books: BookOut[];
  onDone(): void;
}

/** Bottom bar of the selection mode: "N selected · Delete · Cancel". */
export function SelectionBar({ selected, books, onDone }: SelectionBarProps) {
  const t = useT();
  const del = useDeleteSelected(selected, onDone);
  const count = selected.size;
  const [labelling, setLabelling] = useState(false);
  const [tagging, setTagging] = useState(false);
  return (
    <>
      <div className={styles.bar} role="region" aria-label={t('books.selection.label')}>
        <span aria-live="polite">{t('books.selection.count', { count })}</span>
        <Button variant="secondary" size="sm" disabled={count === 0} onClick={() => setLabelling(true)}>
          {t('labels.action')}
        </Button>
        <Button variant="secondary" size="sm" disabled={count === 0} onClick={() => setTagging(true)}>
          {t('tags.action')}
        </Button>
        <span className={styles.apart}>
          <Button variant="secondary" size="sm" icon="trash" disabled={count === 0} onClick={del.ask}>
            {t('common.delete')}
          </Button>
        </span>
        <Button variant="ghost" size="sm" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
      <LabelsDialog bookIds={[...selected]} open={labelling} onClose={() => setLabelling(false)} />
      <AssignTagsDialog books={books} open={tagging} onClose={() => setTagging(false)} />
      <ConfirmDialog
        open={del.confirming}
        title={t('books.selection.confirmTitle', { count })}
        description={t('books.selection.confirmText', { count })}
        confirmLabel={t('books.selection.confirmButton', { count })}
        tone="danger"
        busy={del.busy}
        onConfirm={del.confirm}
        onCancel={del.cancel}
      />
    </>
  );
}
