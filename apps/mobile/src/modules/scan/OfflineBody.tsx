import { useLocale, useT } from '../../app/i18n';
import styles from './Sheet.module.css';

function hour(at: number, locale: string): string {
  return new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/** Not in the phone's copy and no network: say so, with how fresh the copy is. */
export function OfflineBody({ isbn13, syncedAt }: { isbn13: string; syncedAt: number | null }) {
  const t = useT();
  const locale = useLocale();
  return (
    <>
      <p className={styles.muted}>{t('mscan.sheet.offline.text')}</p>
      <p className={styles.muted}>
        {syncedAt === null
          ? t('mscan.sheet.offline.never')
          : t('mscan.sheet.offline.updated', { time: hour(syncedAt, locale) })}
      </p>
      <p className={styles.muted}>{t('mscan.sheet.isbn', { isbn: isbn13 })}</p>
    </>
  );
}
