import { ApiError, createFetchTransport, type ServerInfo, type SetupStatus } from '@bookeeper/api';
import { dispositionName } from './dispositionName';
import { NETWORK_PROBE, type Connection, type Connections, type NotificationControls, type Platform, type ProbeOut, type ReaderFileArgs } from './types';

const KEY = 'bookeeper.connections';
const EMPTY: Connections = { active: null, items: [] };

function read(): Connections {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Connections;
      if (Array.isArray(v.items)) return { active: v.active ?? null, items: v.items };
    }
  } catch {
    // Unreadable storage behaves like no connections.
  }
  return { ...EMPTY, items: [] };
}

function write(c: Connections): Connections {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // Storage may be unavailable; the in-memory result is still returned.
  }
  return c;
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

/** The browser's `Notification`, or `null` where there is none. Read at call time, so a test can add or remove it. */
function browserNotifications(): NotificationControls | null {
  if (typeof Notification === 'undefined') return null;
  return {
    async permission() {
      return Notification.permission === 'default' ? 'prompt' : Notification.permission;
    },
    async request() {
      try {
        return (await Notification.requestPermission()) === 'granted' ? 'granted' : 'denied';
      } catch {
        return 'denied';
      }
    },
    async send({ title, body }) {
      new Notification(title, { body });
    },
  };
}

/** Development and visual testing only: used when `__TAURI_INTERNALS__` is missing. */
export function browserPlatform(baseUrl: string): Platform {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    kind: 'browser',
    transport: () => createFetchTransport(base),
    connections: {
      get: async () => read(),
      async upsert(c: Connection) {
        const cur = read();
        const items = cur.items.some((x) => x.id === c.id)
          ? cur.items.map((x) => (x.id === c.id ? c : x))
          : [...cur.items, c];
        return write({ ...cur, items });
      },
      async activate(id) {
        const cur = read();
        if (!cur.items.some((x) => x.id === id)) throw new Error(`unknown connection ${id}`);
        return write({ ...cur, active: id });
      },
      async remove(id) {
        const cur = read();
        return write({
          active: cur.active === id ? null : cur.active,
          items: cur.items.filter((x) => x.id !== id),
        });
      },
    },
    async probe(url): Promise<ProbeOut> {
      const root = url.replace(/\/+$/, '');
      try {
        const server = await getJson<ServerInfo>(`${root}/api/v1/server`);
        if (!server) return { ...NETWORK_PROBE, error: 'not_bookeeper' };
        const setup = await getJson<SetupStatus>(`${root}/api/v1/setup`);
        return { reachable: true, trusted: true, fingerprint: null, phrase: null, server, setup, error: null };
      } catch {
        return NETWORK_PROBE;
      }
    },
    discover: async () => [],
    sharing: null,
    updates: null,
    notifications: browserNotifications(),
    window: null,
    async deviceName() {
      return 'Browser';
    },
    async downloadToFile(req) {
      let res: Response;
      try {
        res = await fetch(`${base}${req.url}`, { headers: req.headers ?? {} });
      } catch (e) {
        throw new ApiError(0, 'network', e instanceof Error ? e.message : String(e));
      }
      if (!res.ok) return { saved: false, status: res.status };
      // The browser keeps the body as a blob while it arrives; the desktop app streams to disk.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = dispositionName(res.headers.get('content-disposition')) ?? req.suggestedName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
      return { saved: true };
    },
    async readerFile(args: ReaderFileArgs) {
      let res: Response;
      try {
        res = await fetch(`${base}/api/v1/books/${args.bookId}/files/${args.fileId}/content`, { headers: args.headers ?? {} });
      } catch (e) {
        throw new ApiError(0, 'network', e instanceof Error ? e.message : String(e));
      }
      if (!res.ok) throw new ApiError(res.status, 'internal', `The library answered ${res.status}`);
      return URL.createObjectURL(await res.blob());
    },
    async openUrl(url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    async saveFile(req) {
      const url = URL.createObjectURL(new Blob([req.bytes as BlobPart], { type: req.mime }));
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = req.suggestedName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
      return { saved: true };
    },
  };
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
