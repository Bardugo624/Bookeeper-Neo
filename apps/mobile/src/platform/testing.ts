import { vi } from 'vitest';
import type { RawRequest, RawResponse, Transport, TransportResponse } from '@bookeeper/api';
import { memoryStorage } from './storage';
import type {
  BarcodeResult,
  BarcodeScanner,
  Camera,
  CameraSession,
  NetworkStatus,
  Platform,
  ServiceWorkerApi,
} from './types';

export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string> | undefined;
}

export type Handler = (call: RecordedCall) => TransportResponse | Promise<TransportResponse>;

export type RawHandler = (req: RawRequest) => RawResponse | Promise<RawResponse>;

export interface FakeTransport extends Transport {
  calls: RecordedCall[];
  rawCalls: RawRequest[];
}

/** A transport that answers with `handler` and records every request. */
export function fakeTransport(
  handler: Handler = () => ({ status: 404, body: null }),
  rawHandler: RawHandler = () => ({ status: 404, bytes: new Uint8Array(), contentType: null, headers: {} }),
): FakeTransport {
  const calls: RecordedCall[] = [];
  const rawCalls: RawRequest[] = [];
  return {
    calls,
    rawCalls,
    async requestRaw(req) {
      rawCalls.push(req);
      return rawHandler(req);
    },
    async request(method, path, body, headers) {
      const call = { method, path, body, headers };
      calls.push(call);
      return handler(call);
    },
  };
}

export interface FakeServiceWorker extends ServiceWorkerApi {
  /** Simulates the browser announcing a waiting version. */
  emitUpdate(): void;
  applyUpdate: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

export function fakeServiceWorker(): FakeServiceWorker {
  const listeners = new Set<() => void>();
  let ready = false;
  return {
    register: vi.fn(),
    onUpdateReady(listener) {
      listeners.add(listener);
      if (ready) listener();
      return () => void listeners.delete(listener);
    },
    applyUpdate: vi.fn(async () => undefined),
    emitUpdate() {
      ready = true;
      listeners.forEach((l) => l());
    },
  };
}

export interface FakeNetwork extends NetworkStatus {
  set(online: boolean): void;
}

export function fakeNetwork(initial = true): FakeNetwork {
  let online = initial;
  const listeners = new Set<() => void>();
  return {
    online: () => online,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    set(next) {
      online = next;
      listeners.forEach((l) => l());
    },
  };
}

export function fakeCamera(): Camera {
  return {
    open: vi.fn(
      async (deviceId?: string): Promise<CameraSession> => ({
        stream: {} as MediaStream,
        deviceId: deviceId ?? 'rear',
        torchSupported: false,
        setTorch: vi.fn(async () => undefined),
        stop: vi.fn(),
      }),
    ),
    devices: vi.fn(async () => [{ id: 'rear', label: 'Rear camera' }]),
  };
}

export interface FakeScanner extends BarcodeScanner {
  /** Delivers a code to the active `start` callback. */
  emit(result: BarcodeResult): void;
}

export function fakeScanner(): FakeScanner {
  let current: ((r: BarcodeResult) => void) | null = null;
  return {
    engine: 'native',
    start(_video, onResult) {
      current = onResult;
      return () => {
        current = null;
      };
    },
    emit: (result) => current?.(result),
  };
}

export interface FakePlatform extends Platform {
  serviceWorker: FakeServiceWorker;
  network: FakeNetwork;
  scanner: FakeScanner;
  fake: FakeTransport;
}

/** A platform with no browser behind it. Override any part, or give a `handler` for the API. */
export function fakePlatform(
  overrides: Partial<Platform> & { handler?: Handler; rawHandler?: RawHandler; online?: boolean } = {},
): FakePlatform {
  const { handler, rawHandler, online, ...rest } = overrides;
  const fake = fakeTransport(handler, rawHandler);
  return {
    secure: true,
    storage: memoryStorage(),
    serviceWorker: fakeServiceWorker(),
    network: fakeNetwork(online ?? true),
    camera: fakeCamera(),
    scanner: fakeScanner(),
    transport: () => fake,
    deviceName: () => 'iPhone · Safari',
    ...rest,
    fake,
  } as FakePlatform;
}
