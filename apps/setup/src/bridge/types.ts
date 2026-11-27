// Types of the Tauri commands, as fixed by docs/forge/fase-9b/CONTRATTO.md (JSON in camelCase).
export interface SetupInfo {
  mode: 'install' | 'uninstall';
  /** null in the light Setup. */
  payload: { version: string; installedBytes: number } | null;
  installed: { version: string; dir: string; legacy: boolean } | null;
  defaults: { dir: string; desktopIcon: boolean; autostart: boolean };
  blocked: null | 'elevated' | 'incomplete' | 'unsupported';
  data: { bytes: number; hasLibrary: boolean; hasEbooks: boolean };
}

export type FolderProblem =
  | 'needs_admin'
  | 'network'
  | 'not_absolute'
  | 'too_long'
  | 'too_little_space'
  | 'temp_too_small';

export interface DirCheck {
  dir: string;
  problem: FolderProblem | null;
  freeBytes: number;
  drive: string;
}

export type Mode = 'install' | 'update' | 'repair';

export interface InstallRequest {
  dir: string;
  desktopIcon: boolean;
  autostart: boolean;
  mode: Mode;
}

export type StepId = 'prepare' | 'copy' | 'icons' | 'finish' | 'removeApp' | 'removeData';

export interface ProgressEvent {
  step: StepId;
  fraction: number;
  done: boolean;
}

export type OpError = 'app_running' | 'payload' | 'nsis_failed' | 'timeout' | 'verification' | 'io';

export type OpResult = { ok: true } | { ok: false; error: OpError; code?: number };

export type Unlisten = () => void;

/** Everything the UI asks of the native side. Components never touch it directly: they use the hooks. */
export interface Bridge {
  /** Set by the mock for the `dark` scenario; the real app follows the system. */
  readonly forcedTheme?: 'dark';
  setupInfo(): Promise<SetupInfo>;
  checkDir(dir: string): Promise<DirCheck>;
  /** Native folder dialog; null when dismissed. */
  pickDir(current?: string): Promise<string | null>;
  install(request: InstallRequest): Promise<OpResult>;
  uninstall(deleteData: boolean): Promise<OpResult>;
  launchApp(): Promise<void>;
  logTail(): Promise<string>;
  ready(): Promise<void>;
  quit(code: number): Promise<void>;
  minimize(): Promise<void>;
  close(): Promise<void>;
  onProgress(handler: (event: ProgressEvent) => void): Promise<Unlisten>;
  onUninstallRequested(handler: () => void): Promise<Unlisten>;
}
