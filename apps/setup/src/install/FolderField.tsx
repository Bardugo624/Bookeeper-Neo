import { useId } from 'react';
import { Button, Icon } from '@bookeeper/ui/base';
import type { FolderCheck } from '../bridge';
import { formatBytes, useLocale, useT } from '../shell';
import styles from './Customize.module.css';

export interface FolderFieldProps {
  dir: string;
  check: FolderCheck | null;
  /** Bytes the app needs on disk. */
  needBytes: number;
  onPick(): void;
}

/** The read-only folder, «Cambia…», and under it either the space left or what is wrong with the choice. */
export function FolderField({ dir, check, needBytes, onPick }: FolderFieldProps) {
  const t = useT();
  const locale = useLocale();
  const id = useId();
  const problem = check?.problem ?? null;
  const free = formatBytes(check?.freeBytes ?? 0, locale);

  let help = '';
  if (check && problem) help = t(`setup.customize.problem.${problem}`, { free });
  else if (check) help = t('setup.customize.space', { need: formatBytes(needBytes, locale), drive: check.drive, free });

  return (
    <div className={styles.field}>
      <label htmlFor={`${id}-dir`} className={styles.label}>
        {t('setup.customize.folder')}
      </label>
      <div className={styles.fieldRow}>
        <div className={styles.input}>
          <Icon name="folder" />
          <input
            id={`${id}-dir`}
            readOnly
            value={dir}
            title={dir}
            aria-describedby={`${id}-help`}
            aria-invalid={problem ? true : undefined}
          />
        </div>
        <Button variant="secondary" onClick={onPick}>
          {t('setup.customize.change')}
        </Button>
      </div>
      <p id={`${id}-help`} className={styles.help} data-problem={problem ? true : undefined} aria-live="polite">
        {help}
      </p>
    </div>
  );
}
