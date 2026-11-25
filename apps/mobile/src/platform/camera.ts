import { resolveLocale, t } from '@bookeeper/i18n';
import type { Camera, CameraSession } from './types';

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

/** Camera through `getUserMedia`; the rear camera unless a device is named. */
export function browserCamera(mediaDevices: MediaDevices | undefined = navigator.mediaDevices): Camera {
  return {
    async open(deviceId) {
      if (!mediaDevices?.getUserMedia) throw new Error('camera_unavailable');
      const video: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: { ideal: 'environment' } };
      const stream = await mediaDevices.getUserMedia({ video, audio: false });
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as TorchCapabilities;
      const session: CameraSession = {
        stream,
        deviceId: track?.getSettings?.().deviceId ?? deviceId ?? null,
        torchSupported: caps.torch === true,
        async setTorch(on) {
          if (!track || caps.torch !== true) return;
          await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
        },
        stop: () => stream.getTracks().forEach((t) => t.stop()),
      };
      return session;
    },
    async devices() {
      if (!mediaDevices?.enumerateDevices) return [];
      const all = await mediaDevices.enumerateDevices();
      return all
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({ id: d.deviceId, label: d.label || t(resolveLocale('system', navigator.language), 'mobile.cameraLabel', { n: i + 1 }) }));
    },
  };
}
