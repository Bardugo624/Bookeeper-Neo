import type { ReactNode, RefObject } from 'react';
import { useReaderT } from '../i18n';
import { LOADING_DELAY_MS, ReaderStatus, type ReaderError } from '../ui/view';
import type { SessionStatus } from './useBookSession';
import styles from './PagePane.module.css';

export interface PagePaneProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  status: SessionStatus;
  /** 0 to 1: how much of the file has arrived. */
  progress: number;
  onError: (error: ReaderError) => void;
  /** Over the page: the selection bar. */
  children?: ReactNode;
}

/**
 * The page: the engine's frame, with «Apro il libro…» or the error in its place until the book is open.
 * The frame stays mounted all the time, since the engine talks to it.
 */
export function PagePane({ iframeRef, stageRef, status, progress, onError, children }: PagePaneProps) {
  const t = useReaderT();
  const failed = status !== 'loading' && status !== 'ready';
  return (
    <div ref={stageRef} className={styles.stage}>
      <iframe ref={iframeRef} src="/reader-frame.html" title={t('reader.frame.title')} className={styles.frame} data-hidden={status !== 'ready' || undefined} />
      {status === 'ready' ? null : (
        <div className={styles.cover}>
          {failed ? (
            <ReaderStatus kind="error" error={status as ReaderError} onAction={() => onError(status as ReaderError)} />
          ) : (
            <>
              <ReaderStatus kind="loading" delayMs={LOADING_DELAY_MS} />
              {progress > 0 && progress < 1 ? (
                <div
                  className={styles.rail}
                  role="progressbar"
                  aria-label={t('reader.status.opening')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                >
                  <span className={styles.fill} style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
