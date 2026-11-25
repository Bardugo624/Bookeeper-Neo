import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { createTauriTransport } from './transport';
import { NETWORK_PROBE, type Connection, type Connections, type Found, type Platform, type ProbeOut, type SaveFileRequest, type SaveFileResult } from './types';

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

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
