import type { ReadingSummary } from '@bookeeper/api';
import { useT } from '../../app';
import { isStatus } from '../reading';

/** The "Reading" column: the state, with the page when it is being read. */
export function ReadingCell({ reading }: { reading: ReadingSummary | null | undefined }) {
  const t = useT();
  if (!reading || !isStatus(reading.status)) return <>{t('reading.list.none')}</>;
  const label = t(`reading.status.${reading.status}`);
  return <>{reading.status === 'reading' && reading.current_page ? `${label} · ${t('reading.list.pageShort', { page: reading.current_page })}` : label}</>;
}
