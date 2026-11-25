import type { ServerInfo, SetupStatus, Transport } from '@bookeeper/api';

/** Field names mirror the Rust structs in `connections.rs`. */
export interface Connection {
  id: string;
  kind: 'local' | 'remote';
  url: string | null;
  fingerprint: string | null;
  library_name: string | null;
  user_name: string | null;
  device_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
}

export interface Connections {
  active: string | null;
  items: Connection[];
}

export interface ProbeOut {
  reachable: boolean;
  trusted: boolean;
  fingerprint: string | null;
  phrase: string | null;
  server: ServerInfo | null;
  setup: SetupStatus | null;
  error: 'insecure_address' | 'network' | 'not_bookeeper' | null;
}

/** A server found on the local network (`bookeeper_net::mdns::Found`). */
export interface Found {
  instance: string;
  host: string;
  addrs: string[];
  port: number;
  version: string;
  tls: string;
  url: string | null;
}

export interface WindowControls {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  startDragging(): Promise<void>;
  isMaximized(): Promise<boolean>;
  /** Calls `cb` whenever the window size changes; resolves to the unsubscribe function. */
  onResized(cb: () => void): Promise<() => void>;
}

export interface SaveFileRequest {
  suggestedName: string;
  bytes: Uint8Array;
  mime: string;
  filters?: { name: string; extensions: string[] }[];
}

export interface SaveFileResult {
  saved: boolean;
  path?: string;
}

/** Mirrors `SharingStatus` in `sharing.rs`. */
export interface SharingStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  addresses: string[];
  fingerprint: string | null;
  phrase: string | null;
  error: 'port_in_use' | 'password_required' | 'tls' | 'mdns' | null;
}

export interface SharingControls {
  status(): Promise<SharingStatus>;
  set(enabled: boolean, port?: number): Promise<SharingStatus>;
}

export interface Platform {
  kind: 'tauri' | 'browser';
  transport(connectionId?: string): Transport;
  connections: {
    get(): Promise<Connections>;
    upsert(c: Connection): Promise<Connections>;
    activate(id: string): Promise<Connections>;
    remove(id: string): Promise<Connections>;
  };
  probe(url: string): Promise<ProbeOut>;
  discover(): Promise<Found[]>;
  /** `null` where the platform has no window chrome of its own (browser). */
  window: WindowControls | null;
  deviceName(): Promise<string>;
  /** Saves a file the app produced; `saved: false` when the user cancels. */
  saveFile(req: SaveFileRequest): Promise<SaveFileResult>;
  /** `null` where the app cannot serve the library on the network (browser). */
  sharing: SharingControls | null;
}

export const NETWORK_PROBE: ProbeOut = {
  reachable: false,
  trusted: false,
  fingerprint: null,
  phrase: null,
  server: null,
  setup: null,
  error: 'network',
};
