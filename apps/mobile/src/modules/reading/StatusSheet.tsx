import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { BottomSheet } from '../../kit';
import { READING_STATUSES, type ReadingStatus } from './readingModel';
import styles from './Reading.module.css';

export interface StatusSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string;
  onChoose: (status: ReadingStatus) => void;
  onClear: () => void;
}

/** The four states and "remove the state", in a sheet from the bottom edge. */
export function StatusSheet({ open, onOpenChange, current, onChoose, onClear }: StatusSheetProps) {
  const t = useT();
  const done = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t('mreading.sheet.title')}>
      <ul className={styles.options}>
        {READING_STATUSES.map((status) => (
          <li key={status}>
            <button type="button" className={styles.option} aria-pressed={current === status} onClick={done(() => onChoose(status))}>
              <span>{t(`mreading.status.${status}`)}</span>
              {current === status ? <Icon name="check" size={18} /> : null}
            </button>
          </li>
        ))}
        <li>
          <button type="button" className={`${styles.option} ${styles.danger}`} onClick={done(onClear)}>
            {t('mreading.sheet.clear')}
          </button>
        </li>
      </ul>
    </BottomSheet>
  );
}
