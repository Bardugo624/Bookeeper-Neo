import type { BookOut, ReadingOut } from '@bookeeper/api';
import { useLocale, useT } from '../../app/i18n';
import { ReadingRing } from './ReadingRing';
import { formatDay, isStatus } from './readingModel';
import styles from './Reading.module.css';

/** Status, ring, page and dates. */
export function ReadingSummary({ reading, book }: { reading: ReadingOut; book: BookOut }) {
  const t = useT();
  const locale = useLocale();
  const total = book.page_count;
  const status = isStatus(reading.status) ? t(`mreading.status.${reading.status}`) : reading.status;
  const ring = reading.status === 'reading' && ((!!total && total > 0) || reading.progress_percent != null);
  let page = null;
  if (reading.current_page != null && reading.status === 'reading') {
    page = total ? t('mreading.pageOf', { page: reading.current_page, total }) : t('mreading.page', { page: reading.current_page });
  }
  return (
    <div className={styles.summary}>
      {ring ? <ReadingRing reading={reading} pageCount={total} size={64} /> : null}
      <div className={styles.facts}>
        <p className={styles.status}>{status}</p>
        {page ? <p className={styles.small}>{page}</p> : null}
        {reading.started_at != null ? <p className={styles.small}>{t('mreading.startedOn', { date: formatDay(locale, reading.started_at) })}</p> : null}
        {reading.finished_at != null ? <p className={styles.small}>{t('mreading.finishedOn', { date: formatDay(locale, reading.finished_at) })}</p> : null}
      </div>
    </div>
  );
}
