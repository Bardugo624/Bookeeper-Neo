import { EmptyState } from '@bookeeper/ui/base';
import { useT } from './i18n';
import styles from './NeedsHttps.module.css';

/** The only screen of an insecure page: no session, no request. */
export function NeedsHttps() {
  const t = useT();
  return (
    <main className={styles.page}>
      <EmptyState icon="alert" title={t('mobile.needsHttpsTitle')} text={t('mobile.needsHttps')} />
      <p className={styles.help}>{t('mobile.needsHttpsWho')}</p>
      <p className={styles.help}>{t('mobile.needsHttpsHow')}</p>
    </main>
  );
}
