import { useState } from 'react';
import { useT } from '../../app/i18n';
import { Screen } from '../../kit';
import { useSession } from '../../session';
import { BlockedState } from './BlockedState';
import { CameraView } from './CameraView';
import { ResultSheet } from './ResultSheet';
import { useCameraScan } from './useCameraScan';
import { useScanFlow } from './useScanFlow';
import styles from './Scan.module.css';

export function ScanPage() {
  const t = useT();
  const role = useSession((s) => s.me?.user.role);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [added, setAdded] = useState(0);
  const flow = useScanFlow();
  const camera = useCameraScan(video, flow.onCode);
  const blocked = camera.status === 'denied' || camera.status === 'unavailable';

  return (
    <Screen title={t('mscan.title')}>
      {blocked ? (
        <BlockedState reason={camera.status as 'denied' | 'unavailable'} onRetry={camera.retry} onManual={flow.submitManual} />
      ) : (
        <CameraView camera={camera} notice={flow.notice} setVideo={setVideo} />
      )}
      {added > 0 ? (
        <p className={styles.counter} role="status">
          {t('mscan.added', { count: added })}
        </p>
      ) : null}
      <ResultSheet
        isbn={flow.isbn}
        canWrite={role !== undefined && role !== 'guest'}
        onClose={flow.close}
        onAdded={() => setAdded((n) => n + 1)}
      />
    </Screen>
  );
}
