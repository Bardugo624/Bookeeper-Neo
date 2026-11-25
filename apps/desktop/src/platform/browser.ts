import { createFetchTransport, type ServerInfo, type SetupStatus } from '@bookeeper/api';
import { NETWORK_PROBE, type Connection, type Connections, type Platform, type ProbeOut } from './types';

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
    window: null,
    async deviceName() {
      return 'Browser';
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
