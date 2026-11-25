import { useT } from './i18n';
import styles from './Welcome.module.css';

/** Minimal first-launch page, used when no module provides `/welcome`. */
export function Welcome() {
  const t = useT();
  return (
    <main className={styles.page}>
      <h1 className={styles.brand}>{t('app.name')}</h1>
      <p className={styles.text}>{t('shell.welcome.text')}</p>
    </main>
  );
}
