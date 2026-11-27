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
  error: 'port_in_use' | 'port_not_allowed' | 'bind_failed' | 'password_required' | 'tls' | 'mdns' | null;
  /** The port of the last failed port change, when the shell knows it. */
  attempted_port?: number;
}

export interface SharingControls {
  status(): Promise<SharingStatus>;
  set(enabled: boolean, port?: number): Promise<SharingStatus>;
}

export type UpdateChannel = 'stable' | 'beta';

/** Mirrors `UpdateState` in `updates.rs` (tagged by `state`). */
export type UpdateState =
  | { state: 'disabled' }
  | { state: 'up_to_date' }
  | { state: 'available'; version: string; notes: string; date: string | null }
  | { state: 'error'; code: UpdateErrorCode };

export type UpdateErrorCode = 'network' | 'signature' | 'manifest' | 'install';

export interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

export interface UpdateControls {
  check(channel: UpdateChannel): Promise<UpdateState>;
  /** Downloads, verifies, installs and restarts; rejects with an `UpdateErrorCode`. */
  install(channel: UpdateChannel): Promise<void>;
  /** Calls `cb` with the download progress; returns the unsubscribe function. */
  onProgress(cb: (p: UpdateProgress) => void): () => void;
}

export type NotificationPermission = 'granted' | 'denied' | 'prompt';

export interface NotificationControls {
  permission(): Promise<NotificationPermission>;
  /** Asks the system; resolves to the answer (`prompt` counts as `denied`). */
  request(): Promise<'granted' | 'denied'>;
  send(n: { title: string; body: string }): Promise<void>;
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
  /** `null` where the app cannot update itself (browser). */
  updates: UpdateControls | null;
  /** `null` where the app cannot show system notifications. */
  notifications: NotificationControls | null;
  /** Opening the app at login. Only the desktop app has it. */
  autostart?: AutostartControls;
}

export interface AutostartControls {
  get(): Promise<boolean>;
  set(on: boolean): Promise<void>;
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
