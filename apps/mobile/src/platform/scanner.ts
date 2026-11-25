import type { BarcodeFormat, BarcodeResult, BarcodeScanner } from './types';

export const FORMATS: readonly BarcodeFormat[] = ['ean_13', 'ean_8', 'upc_a', 'qr_code'];

interface DetectedBarcode {
  rawValue: string;
  format: string;
}

/** The native detector of Chromium and Safari, typed locally (not in `lib.dom`). */
export interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
export type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/** Starts a continuous read of `video`; returns the controls that stop it. */
export type ZxingStarter = (
  video: HTMLVideoElement,
  onResult: (result: BarcodeResult) => void,
) => Promise<{ stop(): void }>;

const POLL_MS = 250;

function isFormat(f: string): f is BarcodeFormat {
  return (FORMATS as readonly string[]).includes(f);
}

function nativeScanner(Detector: BarcodeDetectorCtor): BarcodeScanner {
  return {
    engine: 'native',
    start(video, onResult) {
      const detector = new Detector({ formats: [...FORMATS] });
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = async () => {
        if (stopped) return;
        try {
          if (video.readyState >= 2) {
            const hit = (await detector.detect(video)).find((b) => isFormat(b.format));
            if (hit && !stopped) onResult({ text: hit.rawValue, format: hit.format as BarcodeFormat });
          }
        } catch {
          // A frame that cannot be read is skipped.
        }
        if (!stopped) timer = setTimeout(() => void tick(), POLL_MS);
      };
      void tick();
      return () => {
        stopped = true;
        clearTimeout(timer);
      };
    },
  };
}

function zxingScanner(start: ZxingStarter): BarcodeScanner {
  return {
    engine: 'zxing',
    start(video, onResult) {
      let stopped = false;
      let controls: { stop(): void } | null = null;
      start(video, (r) => {
        if (!stopped) onResult(r);
      })
        .then((c) => {
          if (stopped) c.stop();
          else controls = c;
        })
        .catch(() => undefined);
      return () => {
        stopped = true;
        controls?.stop();
      };
    },
  };
}

/** ZXing is loaded on demand: phones with a native detector never download it. */
export const startWithZxing: ZxingStarter = async (video, onResult) => {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat: F, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map<number, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.QR_CODE]],
  ]);
  const reader = new BrowserMultiFormatReader(hints);
  const names = new Map<number, BarcodeFormat>([
    [F.EAN_13, 'ean_13'],
    [F.EAN_8, 'ean_8'],
    [F.UPC_A, 'upc_a'],
    [F.QR_CODE, 'qr_code'],
  ]);
  return reader.decodeFromVideoElement(video, (result) => {
    const format = result ? names.get(result.getBarcodeFormat()) : undefined;
    if (result && format) onResult({ text: result.getText(), format });
  });
};

export interface ScannerEnv {
  detector?: BarcodeDetectorCtor | undefined;
  zxing?: ZxingStarter;
}

/** `BarcodeDetector` when the browser has it, ZXing otherwise. */
export function createBarcodeScanner(env: ScannerEnv = {}): BarcodeScanner {
  const detector =
    'detector' in env ? env.detector : (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return detector ? nativeScanner(detector) : zxingScanner(env.zxing ?? startWithZxing);
}
