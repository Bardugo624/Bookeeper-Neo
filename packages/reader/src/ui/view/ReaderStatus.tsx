import { useEffect, useState, type ReactNode } from 'react';
import { useReaderT } from '../../i18n';
import styles from './ReaderStatus.module.css';

export type ReaderError = 'open_failed' | 'missing' | 'offline';
export type ReaderStatusProps =
  | { kind: 'loading'; cover?: ReactNode; delayMs?: number }
  | { kind: 'error'; error: ReaderError; onAction: () => void };

export const LOADING_DELAY_MS = 300;

/** In place of the page: «Apro il libro…» only if it takes more than 300 ms, or an error with its action. */
export function ReaderStatus(props: ReaderStatusProps) {
  return props.kind === 'loading' ? <Loading cover={props.cover} delayMs={props.delayMs ?? LOADING_DELAY_MS} /> : <Failure {...props} />;
}

function Loading({ cover, delayMs }: { cover?: ReactNode; delayMs: number }) {
  const t = useReaderT();
  const [late, setLate] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setLate(true), delayMs);
    return () => clearTimeout(id);
  }, [delayMs]);
  return (
    <div className={styles.status} role="status">
      {late ? (
        <div className={styles.loading}>
          {cover ? <div className={styles.cover}>{cover}</div> : null}
          <p className={styles.message}>{t('reader.status.opening')}</p>
        </div>
      ) : null}
    </div>
  );
}

function Failure({ error, onAction }: { error: ReaderError; onAction: () => void }) {
  const t = useReaderT();
  return (
    <section className={styles.status} role="alert">
      <div className={styles.failure}>
        <h2 className={styles.title}>{t(`reader.error.${error}.title`)}</h2>
        <p className={styles.body}>{t(`reader.error.${error}.body`)}</p>
        <button type="button" className={styles.action} onClick={onAction}>
          {t(`reader.error.${error}.action`)}
        </button>
      </div>
    </section>
  );
}
