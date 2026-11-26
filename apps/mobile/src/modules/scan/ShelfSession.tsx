import { useEffect, useState } from 'react';
import type { ShelfOut } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { BlockedState } from './BlockedState';
import { CameraView } from './CameraView';
import { ManualIsbn } from './ManualIsbn';
import { SessionFeedback } from './SessionFeedback';
import { TitleSheet } from './TitleSheet';
import type { PickedRow } from './ShelfPicker';
import { countPlaced, type SessionState } from './shelfReducer';
import { useCameraScan } from './useCameraScan';
import { useShelfSession } from './useShelfSession';
import styles from './Shelf.module.css';

export interface ShelfSessionProps {
  picked: PickedRow;
  shelves: ShelfOut[];
  /** The session is over (finished or the row is full): the steps go to the summary. */
  onDone: (state: SessionState) => void;
}

/** The camera stays open while the books are read one after the other. */
export function ShelfSession({ picked, shelves, onDone }: ShelfSessionProps) {
  const t = useT();
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [typing, setTyping] = useState(false);
  const session = useShelfSession(picked);
  const { state } = session;
  const camera = useCameraScan(video, session.onCode);
  const blocked = camera.status === 'denied' || camera.status === 'unavailable';

  // The reducer ends the session (finished, or the row is full): hand the steps over.
  useEffect(() => {
    if (state.status !== 'running') onDone(state);
  }, [state, onDone]);

  return (
    <div className={styles.session}>
      <header className={styles.top}>
        <p className={styles.where}>{t('mscan.shelf.session.where', { shelf: picked.shelfName, row: picked.row + 1 })}</p>
        <p className={styles.counter} role="status" aria-label={t('mscan.shelf.session.counterLabel')}>
          {t('mscan.shelf.session.counter', { count: countPlaced(state.steps) })}
        </p>
      </header>
      <CameraView camera={camera} notice={session.notice} setVideo={setVideo} hidden={blocked} />
      {blocked ? (
        <BlockedState reason={camera.status as 'denied' | 'unavailable'} onRetry={camera.retry} onManual={session.submitManual} />
      ) : null}
      <SessionFeedback feedback={state.feedback} shelves={shelves} busy={state.busy} onRetry={session.retry} />
      {typing && !blocked ? <ManualIsbn onSubmit={session.submitManual} /> : null}
      <div className={styles.bar}>
        {state.steps.length > 0 ? (
          <Button variant="secondary" disabled={state.undo === null || state.busy} onClick={() => void session.undo()}>
            {t('mscan.shelf.session.undo')}
          </Button>
        ) : null}
        {blocked ? null : (
          <Button variant="secondary" onClick={() => setTyping((v) => !v)} aria-expanded={typing}>
            {t('mscan.blocked.manual')}
          </Button>
        )}
        <Button variant="primary" onClick={session.finish}>
          {t('mscan.shelf.session.finish')}
        </Button>
      </div>
      <TitleSheet isbn={state.awaiting} onSkip={session.skip} onTitle={session.giveTitle} />
    </div>
  );
}
