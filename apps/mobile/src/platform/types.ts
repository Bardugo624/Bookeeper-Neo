import type { Transport } from '@bookeeper/api';

/** Small key/value store. Synchronous, like `localStorage`. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface ServiceWorkerApi {
  /** Registers the service worker. Safe to call more than once. */
  register(): void;
  /** Calls `listener` when a new version is installed and waiting; at once if one already is. */
  onUpdateReady(listener: () => void): () => void;
  /** Activates the waiting version and reloads the page. */
  applyUpdate(): Promise<void>;
}

export interface NetworkStatus {
  online(): boolean;
  subscribe(listener: () => void): () => void;
}

export interface CameraDevice {
  id: string;
  label: string;
}

export interface CameraSession {
  stream: MediaStream;
  /** Device actually in use, when the browser tells. */
  deviceId: string | null;
  /** Whether the camera has a torch. */
  torchSupported: boolean;
  setTorch(on: boolean): Promise<void>;
  stop(): void;
}

export interface Camera {
  /** Opens the rear camera, or the device given. Rejects when permission is denied. */
  open(deviceId?: string): Promise<CameraSession>;
  devices(): Promise<CameraDevice[]>;
}

export type BarcodeFormat = 'ean_13' | 'ean_8' | 'upc_a' | 'qr_code';

export interface BarcodeResult {
  text: string;
  format: BarcodeFormat;
}

export interface BarcodeScanner {
  /** Which engine reads the codes. */
  engine: 'native' | 'zxing';
  /** Reads continuously from a playing video; returns the function that stops it. */
  start(video: HTMLVideoElement, onResult: (result: BarcodeResult) => void): () => void;
}

export interface Platform {
  /** `window.isSecureContext`: without it the phone cannot use the app. */
  secure: boolean;
  storage: KeyValueStore;
  serviceWorker: ServiceWorkerApi;
  network: NetworkStatus;
  camera: Camera;
  scanner: BarcodeScanner;
  /** Unauthenticated transport to the server that served the app. */
  transport(): Transport;
  /** Name suggested when the phone is paired, e.g. "iPhone · Safari". */
  deviceName(): string;
}
