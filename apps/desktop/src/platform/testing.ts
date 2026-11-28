import { ApiError, type Transport, type TransportResponse } from '@bookeeper/api';
import { NETWORK_PROBE, type Connection, type Connections, type DownloadRequest, type DownloadResult, type Found, type NotificationControls, type NotificationPermission, type Platform, type ProbeOut, type ReaderFileArgs, type SaveFileRequest, type SaveFileResult, type SharingStatus, type UpdateChannel, type UpdateProgress, type UpdateState, type WindowControls } from './types';

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
  /** Every title given to `setWindowTitle`, in order. */
  titles: string[];
  /** Every `saveFile` request, in order. */
  saved: SaveFileRequest[];
  /** Every `downloadToFile` request, in order. */
  downloads: DownloadRequest[];
  /** Result of the next `downloadToFile` calls (default `{ saved: true }`). */
  setDownloadResult(r: DownloadResult | (() => DownloadResult | Promise<DownloadResult>)): void;
  /** Every `readerFile` request, in order. */
  readerFiles: ReaderFileArgs[];
  /** Every address given to `openUrl`, in order. */
  opened: string[];
  /** What `readerFile` answers (default: `asset://localhost/reader/<sha256>.<format>`). */
  setReaderFile(h: (args: ReaderFileArgs) => string | Promise<string>): void;
  /** Result of the next `saveFile` calls (default `{ saved: true }`). */
  setSaveResult(r: SaveFileResult): void;
  setMaximized(v: boolean): void;
  /** Control panel of the fake updates (a stub that throws when `updates` was not asked for). */
  updatesFake: FakeUpdates;
  /** Current state of the fake sharing; tests read it to see what the shell would hold. */
  sharingState: SharingStatus;
  /** Every `sharing.set` call, in order. */
  sharingCalls: Array<{ enabled: boolean; port?: number }>;
  /** Control panel of the fake notifications (`permission` and `request` answers, what was sent). */
  notificationsFake: FakeNotifications;
  /** Replaces what the next `sharing.set` returns (receives the request). */
  setSharingHandler(h: (enabled: boolean, port: number | undefined, current: SharingStatus) => SharingStatus | Promise<SharingStatus>): void;
}

export interface FakeUpdates {
  /** Channel of every `check` call, in order. */
  checks: UpdateChannel[];
  /** Channel of every `install` call, in order. */
  installs: UpdateChannel[];
  /** Replaces the answer of the next checks. */
  setState(s: UpdateState | ((channel: UpdateChannel) => UpdateState)): void;
  /** Replaces what `install` does (default: never finishes, like a restart). */
  setInstall(h: (channel: UpdateChannel) => Promise<void>): void;
  emitProgress(p: UpdateProgress): void;
}

export interface FakeNotifications {
  /** What `permission()` answers now; `request()` moves it to the next answer. */
  permission: NotificationPermission;
  /** What the next `request()` resolves to (default `granted`). */
  nextAnswer: 'granted' | 'denied';
  /** Number of `request()` calls. */
  requests: number;
  /** Every `send` call, in order. */
  sent: Array<{ title: string; body: string }>;
}

export interface FakePlatformOptions {
  /** Gives the platform notifications with this permission (default: `null`, like a browser without them). */
  notifications?: { permission?: NotificationPermission; answer?: 'granted' | 'denied' };
  /** Gives the platform the login-opening choice, starting as `on` (default: absent, like the browser). */
  autostart?: { on?: boolean; failSet?: boolean };
  /** Gives the platform updates; `state` is what the checks answer (default `Disabled`). Absent: `updates` is null. */
  updates?: { state?: UpdateState };
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
  const downloads: DownloadRequest[] = [];
  const readerFiles: ReaderFileArgs[] = [];
  const opened: string[] = [];
  let readerHandler: (args: ReaderFileArgs) => string | Promise<string> = (a) => `asset://localhost/reader/${a.sha256}.${a.format}`;
  let downloadResult: DownloadResult | (() => DownloadResult | Promise<DownloadResult>) = { saved: true };
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
  const titles: string[] = [];
  const progressListeners = new Set<(p: UpdateProgress) => void>();
  let updateAnswer: UpdateState | ((channel: UpdateChannel) => UpdateState) = opts.updates?.state ?? { state: 'disabled' };
  let installHandler: (channel: UpdateChannel) => Promise<void> = () => new Promise<void>(() => {});
  const updatesFake: FakeUpdates = {
    checks: [],
    installs: [],
    setState(s) {
      updateAnswer = s;
    },
    setInstall(h) {
      installHandler = h;
    },
    emitProgress(p) {
      progressListeners.forEach((cb) => cb(p));
    },
  };
  const notificationsFake: FakeNotifications = {
    permission: opts.notifications?.permission ?? 'prompt',
    nextAnswer: opts.notifications?.answer ?? 'granted',
    requests: 0,
    sent: [],
  };
  const notifications: NotificationControls = {
    async permission() {
      return notificationsFake.permission;
    },
    async request() {
      notificationsFake.requests += 1;
      notificationsFake.permission = notificationsFake.nextAnswer;
      return notificationsFake.nextAnswer;
    },
    async send(n) {
      notificationsFake.sent.push({ ...n });
    },
  };
  let autostartOn = opts.autostart?.on ?? false;
  const autostart = {
    async get() {
      return autostartOn;
    },
    async set(on: boolean) {
      if (opts.autostart?.failSet) throw new Error('failed');
      autostartOn = on;
    },
  };
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
    updatesFake,
    notificationsFake,
    state: opts.connections ?? { active: null, items: [] },
    windowCalls,
    titles,
    saved,
    downloads,
    readerFiles,
    opened,
    setReaderFile(h) {
      readerHandler = h;
    },
    setDownloadResult(r) {
      downloadResult = r;
    },
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
    updates: opts.updates
      ? {
          async check(channel) {
            updatesFake.checks.push(channel);
            return typeof updateAnswer === 'function' ? updateAnswer(channel) : updateAnswer;
          },
          async install(channel) {
            updatesFake.installs.push(channel);
            return installHandler(channel);
          },
          onProgress(cb) {
            progressListeners.add(cb);
            return () => progressListeners.delete(cb);
          },
        }
      : null,
    notifications: opts.notifications ? notifications : null,
    ...(opts.autostart ? { autostart } : {}),
    window: opts.window === false ? null : win,
    async setWindowTitle(title) {
      titles.push(title);
    },
    async deviceName() {
      return 'Test device';
    },
    async downloadToFile(req) {
      downloads.push(req);
      return typeof downloadResult === 'function' ? downloadResult() : { ...downloadResult };
    },
    async readerFile(args) {
      readerFiles.push(args);
      return readerHandler(args);
    },
    async openUrl(url) {
      opened.push(url);
    },
    async saveFile(req) {
      saved.push(req);
      return { ...saveResult };
    },
  };
  return platform;
}
