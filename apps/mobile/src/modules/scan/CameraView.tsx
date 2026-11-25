import { IconButton } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import type { useCameraScan } from './useCameraScan';
import styles from './Scan.module.css';

type Camera = ReturnType<typeof useCameraScan>;

export interface CameraViewProps {
  camera: Camera;
  notice: boolean;
  setVideo: (el: HTMLVideoElement | null) => void;
}

/** Full-bleed preview with an aiming frame, the torch and camera switch, and the discreet notice. */
export function CameraView({ camera, notice, setVideo }: CameraViewProps) {
  const t = useT();
  return (
    <div className={styles.stage}>
      <video ref={setVideo} className={styles.video} playsInline muted autoPlay aria-label={t('mscan.camera.label')} />
      <div className={styles.frame} aria-hidden="true" />
      {camera.status === 'starting' ? (
        <p className={styles.starting} role="status">
          {t('mscan.camera.starting')}
        </p>
      ) : (
        <p className={styles.hint}>{t('mscan.camera.hint')}</p>
      )}
      <div className={styles.controls}>
        {camera.torchSupported ? (
          <IconButton
            icon="sun"
            label={t(camera.torch ? 'mscan.camera.torchOff' : 'mscan.camera.torchOn')}
            aria-pressed={camera.torch}
            onClick={camera.toggleTorch}
          />
        ) : null}
        {camera.canSwitch ? (
          <IconButton icon="loans" label={t('mscan.camera.switch')} onClick={camera.switchCamera} />
        ) : null}
      </div>
      {notice ? (
        <p className={styles.notice} role="status">
          {t('mscan.camera.notIsbn')}
        </p>
      ) : null}
    </div>
  );
}
