import { Icon } from '@bookeeper/ui/base';
import { ProgressRing } from '@bookeeper/ui/book';
import { useT } from '../../app/i18n';
import { isStatus, ringPercent } from './readingModel';

export interface ReadingRingProps {
  reading: { status: string; current_page?: number | null; progress_percent?: number | null };
  pageCount: number | null | undefined;
  size: number;
}

/** Progress of the book: the file's percent when there is one, else the page over the total; full when read. */
export function ReadingRing({ reading, pageCount, size }: ReadingRingProps) {
  const t = useT();
  const percent = ringPercent(reading, pageCount);
  const status = isStatus(reading.status) ? t(`mreading.status.${reading.status}`) : reading.status;
  const label = percent === null ? status : t('mreading.ring.label', { status, percent });
  let center = null;
  if (reading.status === 'read') center = <Icon name="check" size={Math.round(size / 3)} />;
  else if (percent !== null) center = `${percent}%`;
  return (
    <ProgressRing value={(percent ?? 0) / 100} size={size} label={label}>
      {center}
    </ProgressRing>
  );
}
