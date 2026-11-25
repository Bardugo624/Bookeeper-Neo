import { useState, type DragEvent } from 'react';
import { useT } from '../../../../app/i18n';
import { cx } from '../../../../kit/cx';
import { IMPORT_LIMIT_MB } from './transferModel';
import styles from './TransferSection.module.css';

export interface ImportDropzoneProps {
  disabled: boolean;
  onPick(file: File | null): void;
}

/** A box that takes a dropped file or opens the system picker on click. */
export function ImportDropzone({ disabled, onPick }: ImportDropzoneProps) {
  const t = useT();
  const [over, setOver] = useState(false);

  const drop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) onPick(file);
  };

  return (
    <label
      className={cx(styles.drop, over && styles.dragging)}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <input
        type="file"
        className={styles.input}
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
        disabled={disabled}
        aria-label={t('transfer.import.drop.label')}
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null);
          // Lets the same file be chosen again after a change of mind.
          e.target.value = '';
        }}
      />
      <span className={styles.dropTitle}>{over ? t('transfer.import.drop.dragging') : t('transfer.import.drop.label')}</span>
      <span className={styles.hint}>{t('transfer.import.drop.hint', { size: IMPORT_LIMIT_MB })}</span>
    </label>
  );
}
