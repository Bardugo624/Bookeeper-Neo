import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import type { Bridge, DirCheck, OpResult, ProgressEvent, SetupInfo } from './types';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function tauriBridge(): Bridge {
  return {
    setupInfo: () => invoke<SetupInfo>('setup_info'),
    checkDir: (dir) => invoke<DirCheck>('check_dir', { dir }),
    async pickDir(current) {
      const picked = await open({ directory: true, multiple: false, defaultPath: current });
      return typeof picked === 'string' ? picked : null;
    },
    install: (request) => invoke<OpResult>('install', { request }),
    uninstall: (deleteData) => invoke<OpResult>('uninstall', { deleteData }),
    launchApp: () => invoke<void>('launch_app'),
    logTail: () => invoke<string>('log_tail'),
    ready: () => invoke<void>('ready'),
    quit: (code) => invoke<void>('quit', { code }),
    minimize: () => getCurrentWindow().minimize(),
    close: () => getCurrentWindow().close(),
    onProgress: (handler) => listen<ProgressEvent>('setup://progress', (e) => handler(e.payload)),
    onUninstallRequested: (handler) => listen('setup://uninstall-requested', () => handler()),
  };
}
