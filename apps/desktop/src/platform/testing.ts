import { ApiError, type Transport, type TransportResponse } from '@bookeeper/api';
import { NETWORK_PROBE, type Connection, type Connections, type Found, type Platform, type ProbeOut, type WindowControls } from './types';

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
  setMaximized(v: boolean): void;
}

export interface FakePlatformOptions {
  connections?: Connections;
  handler?: Handler;
  /** `false` gives a browser-like platform with no window controls. */
  window?: boolean;
  kind?: Platform['kind'];
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
    window: opts.window === false ? null : win,
    async deviceName() {
      return 'Test device';
    },
  };
  return platform;
}
