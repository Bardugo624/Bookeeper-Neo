import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@bookeeper/ui/base';
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
  const navigate = useNavigate();
  const flow = useScanFlow();
  const camera = useCameraScan(video, flow.onCode);
  const blocked = camera.status === 'denied' || camera.status === 'unavailable';

  return (
    <Screen title={t('mscan.title')}>
      {/* The video stays mounted while blocked, so a retry still has an element to attach to. */}
      <CameraView camera={camera} notice={flow.notice} setVideo={setVideo} hidden={blocked} />
      {blocked ? (
        <BlockedState reason={camera.status as 'denied' | 'unavailable'} onRetry={camera.retry} onManual={flow.submitManual} />
      ) : null}
      {added > 0 ? (
        <p className={styles.counter} role="status">
          {t('mscan.added', { count: added })}
        </p>
      ) : null}
      {role !== undefined && role !== 'guest' ? (
        <div className={styles.enter}>
          <Button variant="secondary" onClick={() => navigate('/scan/shelf')}>
            {t('mscan.shelf.enter')}
          </Button>
        </div>
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
