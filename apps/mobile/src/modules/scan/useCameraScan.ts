import { useEffect, useRef, useState } from 'react';
import { usePlatform, type BarcodeResult, type CameraDevice, type CameraSession } from '../../platform';

export type CameraStatus = 'starting' | 'running' | 'denied' | 'unavailable';

/** `camera_unavailable` is what the platform throws without `getUserMedia`; the rest is the browser's own. */
function failureStatus(e: unknown): 'denied' | 'unavailable' {
  const name = e instanceof Error ? (e.name === 'Error' ? e.message : e.name) : '';
  return name === 'camera_unavailable' || name === 'NotFoundError' || name === 'OverconstrainedError'
    ? 'unavailable'
    : 'denied';
}

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/**
 * Keeps the camera and the code reader running while the page is mounted and in the foreground:
 * both stop when the page goes to the background, and start again when it comes back.
 * Asking for permission happens once the page is mounted, i.e. when the tab is entered.
 */
export function useCameraScan(video: HTMLVideoElement | null, onCode: (r: BarcodeResult) => void) {
  const { camera, scanner } = usePlatform();
  const [status, setStatus] = useState<CameraStatus>('starting');
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [session, setSession] = useState<CameraSession | null>(null);
  const [torch, setTorch] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [background, setBackground] = useState(hidden);
  const latest = useRef(onCode);
  latest.current = onCode;

  useEffect(() => {
    const onChange = () => setBackground(hidden());
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  useEffect(() => {
    if (!video || background) return;
    let cancelled = false;
    let opened: CameraSession | null = null;
    let stopReading: (() => void) | null = null;
    setStatus('starting');
    camera
      .open(deviceId)
      .then(async (s) => {
        if (cancelled) {
          s.stop();
          return;
        }
        opened = s;
        video.srcObject = s.stream;
        try {
          await video.play?.();
        } catch {
          // Autoplay refused or interrupted: the stream is still attached, and the reader copes.
        }
        if (cancelled) return;
        stopReading = scanner.start(video, (r) => latest.current(r));
        setSession(s);
        setTorch(false);
        setStatus('running');
        camera.devices().then(
          (list) => !cancelled && setDevices(list),
          () => undefined,
        );
      })
      .catch((e: unknown) => {
        if (!cancelled) setStatus(failureStatus(e));
      });
    return () => {
      cancelled = true;
      stopReading?.();
      opened?.stop();
      if (video.srcObject) video.srcObject = null;
      setSession(null);
    };
  }, [video, camera, scanner, deviceId, background, attempt]);

  const toggleTorch = () => {
    const next = !torch;
    setTorch(next);
    session?.setTorch(next).catch(() => setTorch(!next));
  };

  const switchCamera = () => {
    if (devices.length < 2) return;
    const at = devices.findIndex((d) => d.id === (session?.deviceId ?? deviceId));
    setDeviceId(devices[(at + 1) % devices.length]!.id);
  };

  return {
    status,
    torchSupported: session?.torchSupported === true,
    torch,
    toggleTorch,
    canSwitch: devices.length > 1,
    switchCamera,
    retry: () => setAttempt((n) => n + 1),
  };
}
