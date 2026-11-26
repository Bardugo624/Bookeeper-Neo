import { Icon } from '@bookeeper/ui/base';
import { ProgressRing } from '@bookeeper/ui/book';
import { useT } from '../../app';
import { isStatus, percentOf } from './readingModel';

export interface ReadingRingProps {
  /** The caller's state of the book (the full one or the summary inside a book); `null` draws nothing. */
  reading: { status: string; current_page?: number | null } | null | undefined;
  pageCount: number | null | undefined;
  size: number;
}

/** Progress of the book: the page over the total; full when read; no number without the total. */
export function ReadingRing({ reading, pageCount, size }: ReadingRingProps) {
  const t = useT();
  if (!reading) return null;
  const percent = percentOf(reading.status, reading.current_page, pageCount);
  const status = isStatus(reading.status) ? t(`reading.status.${reading.status}`) : reading.status;
  const label = percent === null ? status : t('reading.ring.label', { status, percent });
  // Small rings carry no text; the large one shows the number, or a mark when the book is read.
  const big = size >= 44;
  let center = null;
  if (big && reading.status === 'read') center = <Icon name="check" size={Math.round(size / 3)} />;
  else if (big && percent !== null) center = t('reading.ring.percent', { percent });
  return (
    <ProgressRing value={(percent ?? 0) / 100} size={size} label={label}>
      {center}
    </ProgressRing>
  );
}
