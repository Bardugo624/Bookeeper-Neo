import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { createTauriTransport } from './transport';
import { NETWORK_PROBE, type Connection, type Connections, type Found, type NotificationControls, type Platform, type ProbeOut, type SaveFileRequest, type SaveFileResult, type SharingStatus, type UpdateControls, type UpdateErrorCode, type UpdateProgress, type UpdateState } from './types';

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const CODES: UpdateErrorCode[] = ['network', 'signature', 'manifest', 'install'];

/** One object for every platform instance, so the modules that share it share its state. */
const tauriUpdates: UpdateControls = {
  async check(channel) {
    try {
      return await invoke<UpdateState>('update_check', { channel });
    } catch {
      return { state: 'error', code: 'manifest' };
    }
  },
  async install(channel) {
    try {
      await invoke<void>('update_install', { channel });
    } catch (e) {
      throw CODES.includes(e as UpdateErrorCode) ? e : 'install';
    }
  },
  onProgress(cb) {
    let off: (() => void) | null = null;
    let closed = false;
    void listen<UpdateProgress>('update://progress', (event) => cb(event.payload)).then((fn) => {
      if (closed) fn();
      else off = fn;
    });
    return () => {
      closed = true;
      off?.();
    };
  },
};

const tauriNotifications: NotificationControls = {
  async permission() {
    try {
      // The plugin only says granted or not; the browser-style `Notification` tells `denied` from `prompt`.
      if (await isPermissionGranted()) return 'granted';
      return typeof Notification === 'undefined' || Notification.permission !== 'denied' ? 'prompt' : 'denied';
    } catch {
      return 'denied';
    }
  },
  async request() {
    try {
      return (await requestPermission()) === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  },
  async send({ title, body }) {
    sendNotification({ title, body });
  },
};

/** Commands that ship with a later task are called by name; a missing one is a handled error. */
export function tauriPlatform(): Platform {
  const win = getCurrentWindow();
  return {
    kind: 'tauri',
    transport: (connectionId) => createTauriTransport(connectionId),
    connections: {
      get: () => invoke<Connections>('connections_get'),
      upsert: (connection: Connection) => invoke<Connections>('connection_upsert', { connection }),
      activate: (id) => invoke<Connections>('connection_activate', { id }),
      remove: (id) => invoke<Connections>('connection_remove', { id }),
    },
    async probe(url): Promise<ProbeOut> {
      try {
        return await invoke<ProbeOut>('server_probe', { url });
      } catch {
        return NETWORK_PROBE;
      }
    },
    async discover(): Promise<Found[]> {
      try {
        return await invoke<Found[]>('discover');
      } catch {
        return [];
      }
    },
    sharing: {
      status: () => invoke<SharingStatus>('sharing_status'),
      set: (enabled, port) => invoke<SharingStatus>('sharing_set', { enabled, port: port ?? null }),
    },
    updates: tauriUpdates,
    notifications: tauriNotifications,
    window: {
      minimize: () => win.minimize(),
      toggleMaximize: () => win.toggleMaximize(),
      close: () => win.close(),
      startDragging: () => win.startDragging(),
      isMaximized: () => win.isMaximized(),
      onResized: (cb) => win.onResized(() => cb()),
    },
    async deviceName() {
      return navigator.platform || 'Bookeeper';
    },
    saveFile: (req: SaveFileRequest) =>
      invoke<SaveFileResult>('save_file', {
        suggested_name: req.suggestedName,
        bytes_base64: toBase64(req.bytes),
        filters: req.filters ?? [],
      }),
  };
}
