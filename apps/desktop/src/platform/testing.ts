import { ApiError, type Transport, type TransportResponse } from '@bookeeper/api';
import { NETWORK_PROBE, type Connection, type Connections, type Found, type Platform, type ProbeOut, type SaveFileRequest, type SaveFileResult, type SharingStatus, type WindowControls } from './types';

type Handler = (req: {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  connectionId?: string;
}) => TransportResponse | Promise<TransportResponse>;

export interface FakePlatform extends Platform {
  /** Every request that went through `transport()`, in order. */
  calls: Array<{ method: string; path: string; body?: unknown; headers?: Record<string, string>; connectionId?: string }>;
  state: Connections;
  /** Replaces the HTTP handler (default: 404 for everything). */
  handle(handler: Handler): void;
  setProbe(out: ProbeOut): void;
  setFound(found: Found[]): void;
  windowCalls: string[];
  /** Every `saveFile` request, in order. */
  saved: SaveFileRequest[];
  /** Result of the next `saveFile` calls (default `{ saved: true }`). */
  setSaveResult(r: SaveFileResult): void;
  setMaximized(v: boolean): void;
  /** Current state of the fake sharing; tests read it to see what the shell would hold. */
  sharingState: SharingStatus;
  /** Every `sharing.set` call, in order. */
  sharingCalls: Array<{ enabled: boolean; port?: number }>;
  /** Replaces what the next `sharing.set` returns (receives the request). */
  setSharingHandler(h: (enabled: boolean, port: number | undefined, current: SharingStatus) => SharingStatus | Promise<SharingStatus>): void;
}

export interface FakePlatformOptions {
  connections?: Connections;
  handler?: Handler;
  /** `false` gives a browser-like platform with no window controls. */
  window?: boolean;
  kind?: Platform['kind'];
  /** `false` leaves `sharing` null, like the browser. */
  sharing?: boolean;
  sharingStatus?: Partial<SharingStatus>;
}

export function fakeConnection(over: Partial<Connection> = {}): Connection {
  return {
    id: 'c1',
    kind: 'local',
    url: null,
    fingerprint: null,
    library_name: 'Casa',
    user_name: 'Anna',
    device_id: 'd1',
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    ...over,
  };
}

/** In-memory `Platform` for tests of the app and of its modules. */
export function fakePlatform(opts: FakePlatformOptions = {}): FakePlatform {
  let handler: Handler = opts.handler ?? (() => ({ status: 404, body: { error: { code: 'not_found', message: 'x' } } }));
  let probe: ProbeOut = NETWORK_PROBE;
  let found: Found[] = [];
  let maximized = false;
  let saveResult: SaveFileResult = { saved: true };
  const saved: SaveFileRequest[] = [];
  const sharingCalls: FakePlatform['sharingCalls'] = [];
  let sharingHandler: Parameters<FakePlatform['setSharingHandler']>[0] = (enabled, port, cur) => ({
    ...cur,
    enabled,
    running: enabled,
    port: port ?? cur.port,
    addresses: enabled ? [`https://192.168.1.20:${port ?? cur.port}`] : [],
    fingerprint: enabled ? 'AA:BB:CC:DD' : null,
    phrase: enabled ? 'uno due tre quattro cinque sei' : null,
    error: null,
  });
  const resizeListeners = new Set<() => void>();
  const windowCalls: string[] = [];
  const calls: FakePlatform['calls'] = [];

  const win: WindowControls = {
    async minimize() {
      windowCalls.push('minimize');
    },
    async toggleMaximize() {
      windowCalls.push('toggleMaximize');
    },
    async close() {
      windowCalls.push('close');
    },
    async startDragging() {
      windowCalls.push('startDragging');
    },
    async isMaximized() {
      return maximized;
    },
    async onResized(cb) {
      resizeListeners.add(cb);
      return () => resizeListeners.delete(cb);
    },
  };

  const platform: FakePlatform = {
    kind: opts.kind ?? 'tauri',
    calls,
    state: opts.connections ?? { active: null, items: [] },
    windowCalls,
    saved,
    sharingCalls,
    sharingState: { enabled: false, running: false, port: 7842, addresses: [], fingerprint: null, phrase: null, error: null, ...opts.sharingStatus },
    setSharingHandler(h) {
      sharingHandler = h;
    },
    setSaveResult(r) {
      saveResult = r;
    },
    handle(h) {
      handler = h;
    },
    setProbe(p) {
      probe = p;
    },
    setFound(f) {
      found = f;
    },
    setMaximized(v) {
      maximized = v;
      resizeListeners.forEach((cb) => cb());
    },
    transport(connectionId): Transport {
      return {
        async request(method, path, body, headers) {
          const req = { method, path, body, headers, connectionId };
          calls.push(req);
          try {
            return await handler(req);
          } catch (e) {
            if (e instanceof ApiError) throw e;
            throw new ApiError(0, 'network', String(e));
          }
        },
      };
    },
    connections: {
      async get() {
        return structuredClone(platform.state);
      },
      async upsert(c) {
        const items = platform.state.items.some((x) => x.id === c.id)
          ? platform.state.items.map((x) => (x.id === c.id ? c : x))
          : [...platform.state.items, c];
        platform.state = { ...platform.state, items };
        return structuredClone(platform.state);
      },
      async activate(id) {
        if (!platform.state.items.some((x) => x.id === id)) throw new Error(`unknown connection ${id}`);
        platform.state = { ...platform.state, active: id };
        return structuredClone(platform.state);
      },
      async remove(id) {
        platform.state = {
          active: platform.state.active === id ? null : platform.state.active,
          items: platform.state.items.filter((x) => x.id !== id),
        };
        return structuredClone(platform.state);
      },
    },
    async probe() {
      return probe;
    },
    async discover() {
      return found;
    },
    sharing:
      opts.sharing === false
        ? null
        : {
            async status() {
              return structuredClone(platform.sharingState);
            },
            async set(enabled, port) {
              sharingCalls.push({ enabled, ...(port === undefined ? {} : { port }) });
              platform.sharingState = await sharingHandler(enabled, port, platform.sharingState);
              return structuredClone(platform.sharingState);
            },
          },
    window: opts.window === false ? null : win,
    async deviceName() {
      return 'Test device';
    },
    async saveFile(req) {
      saved.push(req);
      return { ...saveResult };
    },
  };
  return platform;
}
