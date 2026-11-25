import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { ConfirmDialog } from '../../kit';
import { useDeleteSelected } from './useDeleteSelected';
import styles from './SelectionBar.module.css';

export interface SelectionBarProps {
  selected: ReadonlySet<string>;
  onDone(): void;
}

/** Bottom bar of the selection mode: "N selected · Delete · Cancel". */
export function SelectionBar({ selected, onDone }: SelectionBarProps) {
  const t = useT();
  const del = useDeleteSelected(selected, onDone);
  const count = selected.size;
  return (
    <>
      <div className={styles.bar} role="region" aria-label={t('books.selection.label')}>
        <span aria-live="polite">{t('books.selection.count', { count })}</span>
        <Button variant="danger" size="sm" disabled={count === 0} onClick={del.ask}>
          {t('common.delete')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
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
