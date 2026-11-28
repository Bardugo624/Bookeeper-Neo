import type { ReadingSummary } from '@bookeeper/api';
import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { ReadingRing } from './ReadingRing';
import styles from './Reading.module.css';

export interface ReadingBadgeProps {
  reading: Pick<ReadingSummary, 'status' | 'current_page' | 'progress_percent'> | null | undefined;
  pageCount: number | null | undefined;
  id?: string;
}

/** End of a list row: a small ring while reading, a tick once read, nothing otherwise. */
export function ReadingBadge({ reading, pageCount, id }: ReadingBadgeProps) {
  const t = useT();
  if (reading?.status === 'reading') {
    return (
      <span id={id} className={styles.badge}>
        <ReadingRing reading={reading} pageCount={pageCount} size={44} />
      </span>
    );
  }
  if (reading?.status === 'read') {
    return (
      <span id={id} role="img" aria-label={t('mreading.status.read')} className={`${styles.badge} ${styles.tick}`}>
        <Icon name="check" size={16} />
      </span>
    );
  }
  return null;
}
