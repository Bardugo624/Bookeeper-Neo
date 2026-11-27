import type { Bridge, DirCheck, InstallRequest, OpResult, ProgressEvent, SetupInfo, StepId, Unlisten } from './types';

export const SCENARIOS = [
  'welcome',
  'customize',
  'progress',
  'done',
  'running',
  'error',
  'older',
  'same',
  'newer',
  'legacy',
  'uninstall',
  'uninstall-ebooks',
  'uninstall-remote',
  'removed',
  'elevated',
  'incomplete',
  'unsupported',
  'dark',
] as const;

export type Scenario = (typeof SCENARIOS)[number];

const MB = 1024 * 1024;
const DIR = 'C:\\Users\\Giulia\\AppData\\Local\\Bookeeper';

/** `#scenario=<name>` in the address; anything else is `welcome`. */
export function scenarioFromHash(hash: string): Scenario {
  const name = /scenario=([\w-]+)/.exec(hash)?.[1];
  return (SCENARIOS as readonly string[]).includes(name ?? '') ? (name as Scenario) : 'welcome';
}

export function mockInfo(scenario: Scenario): SetupInfo {
  const base: SetupInfo = {
    mode: 'install',
    payload: { version: '2.2.0', installedBytes: 41 * MB },
    installed: null,
    defaults: { dir: DIR, desktopIcon: true, autostart: false },
    blocked: null,
    data: { bytes: 0, hasLibrary: false, hasEbooks: false },
  };
  const installed = (version: string, legacy = false) => ({ version, dir: DIR, legacy });
  switch (scenario) {
    case 'older':
      return { ...base, installed: installed('2.1.0'), data: { bytes: 18 * MB, hasLibrary: true, hasEbooks: false } };
    case 'same':
      return { ...base, installed: installed('2.2.0') };
    case 'newer':
      return { ...base, installed: installed('2.3.0') };
    case 'legacy':
      return { ...base, installed: installed('1.4.0', true) };
    case 'uninstall':
    case 'removed':
      return {
        ...base,
        mode: 'uninstall',
        payload: null,
        installed: installed('2.2.0'),
        data: { bytes: 212 * MB, hasLibrary: true, hasEbooks: false },
      };
    case 'uninstall-ebooks':
      return {
        ...base,
        mode: 'uninstall',
        payload: null,
        installed: installed('2.2.0'),
        data: { bytes: 1536 * MB, hasLibrary: true, hasEbooks: true },
      };
    case 'uninstall-remote':
      return {
        ...base,
        mode: 'uninstall',
        payload: null,
        installed: installed('2.2.0'),
        data: { bytes: 2 * MB, hasLibrary: false, hasEbooks: false },
      };
    case 'elevated':
    case 'incomplete':
    case 'unsupported':
      return { ...base, blocked: scenario };
    default:
      return base;
  }
}

const INSTALL_STEPS: StepId[] = ['prepare', 'copy', 'icons', 'finish'];
const UNINSTALL_STEPS: StepId[] = ['removeApp', 'removeData'];

export interface MockOptions {
  /** Milliseconds between progress events. */
  tickMs?: number;
}

export interface MockBridge extends Bridge {
  readonly scenario: Scenario;
  /** Test hooks: push an event, or simulate a second launch with `--uninstall`. */
  emitProgress(event: ProgressEvent): void;
  requestUninstall(): void;
  readonly calls: string[];
}

export function mockBridge(scenario: Scenario, options: MockOptions = {}): MockBridge {
  const info = mockInfo(scenario);
  const tickMs = options.tickMs ?? (scenario === 'progress' ? 700 : 60);
  const progress = new Set<(e: ProgressEvent) => void>();
  const uninstallRequests = new Set<() => void>();
  const calls: string[] = [];
  let runs = 0;

  const emit = (event: ProgressEvent) => progress.forEach((h) => h(event));
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  async function run(steps: StepId[]): Promise<void> {
    for (const step of steps) {
      for (let i = 0; i <= 4; i += 1) {
        emit({ step, fraction: i / 4, done: false });
        await wait(tickMs);
      }
    }
    emit({ step: steps[steps.length - 1]!, fraction: 1, done: true });
  }

  const subscribe = <T>(set: Set<T>, handler: T): Promise<Unlisten> => {
    set.add(handler);
    return Promise.resolve(() => void set.delete(handler));
  };

  return {
    scenario,
    calls,
    forcedTheme: scenario === 'dark' ? 'dark' : undefined,
    setupInfo: () => Promise.resolve(info),
    checkDir: (dir): Promise<DirCheck> =>
      Promise.resolve({
        dir,
        problem: dir.startsWith('\\\\') ? 'network' : null,
        freeBytes: 212 * 1024 * MB,
        drive: dir.slice(0, 2) || 'C:',
      }),
    pickDir: () => Promise.resolve('C:\\Programmi Miei\\Bookeeper'),
    async install(request: InstallRequest): Promise<OpResult> {
      calls.push(`install:${request.mode}`);
      runs += 1;
      if (scenario === 'running' && runs === 1) return { ok: false, error: 'app_running' };
      if (scenario === 'error') return { ok: false, error: 'nsis_failed', code: 5 };
      await run(INSTALL_STEPS);
      return { ok: true };
    },
    async uninstall(deleteData: boolean): Promise<OpResult> {
      calls.push(`uninstall:${deleteData}`);
      await run(UNINSTALL_STEPS);
      return { ok: true };
    },
    launchApp: () => Promise.resolve(void calls.push('launchApp')),
    logTail: () => Promise.resolve('[00:00:01] install: start\n[00:00:02] nsis exited with code 5'),
    ready: () => Promise.resolve(void calls.push('ready')),
    quit: (code) => Promise.resolve(void calls.push(`quit:${code}`)),
    minimize: () => Promise.resolve(void calls.push('minimize')),
    close: () => Promise.resolve(void calls.push('close')),
    onProgress: (handler) => subscribe(progress, handler),
    onUninstallRequested: (handler) => subscribe(uninstallRequests, handler),
    emitProgress: emit,
    requestUninstall: () => uninstallRequests.forEach((h) => h()),
  };
}
