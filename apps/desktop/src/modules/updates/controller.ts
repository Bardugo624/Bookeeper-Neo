import type { UpdateChannel, UpdateControls, UpdateErrorCode, UpdateProgress, UpdateState } from '../../platform';

export const CHANNEL_KEY = 'bookeeper.update.channel';
export const DISMISSED_KEY = 'bookeeper.update.dismissed';
/** Time between two checks. */
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export interface UpdatesSnapshot {
  channel: UpdateChannel;
  /** The last answer for the current channel; `null` until the first check ends. */
  result: UpdateState | null;
  checking: boolean;
  /** Epoch ms of the last finished check. */
  lastCheck: number | null;
  /** The version the user hid with "Later". */
  dismissed: string | null;
  installing: boolean;
  progress: UpdateProgress | null;
  installError: UpdateErrorCode | null;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice still applies for this run.
  }
}

/** State and timers of the updates, shared by everything that shows them. */
export class UpdatesController {
  private snap: UpdatesSnapshot;
  private listeners = new Set<() => void>();
  private seq = 0;
  private refs = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private offProgress: (() => void) | null = null;

  constructor(private readonly updates: UpdateControls) {
    const channel = read(CHANNEL_KEY) === 'beta' ? 'beta' : 'stable';
    this.snap = {
      channel,
      result: null,
      checking: false,
      lastCheck: null,
      dismissed: read(DISMISSED_KEY),
      installing: false,
      progress: null,
      installError: null,
    };
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getSnapshot = (): UpdatesSnapshot => this.snap;

  private set(patch: Partial<UpdatesSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((cb) => cb());
  }

  /** A screen starts watching: the first one checks (if it is time) and starts the 6-hour timer. */
  retain(): () => void {
    this.refs += 1;
    if (this.refs === 1) {
      this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS);
      const { lastCheck } = this.snap;
      if (lastCheck === null || Date.now() - lastCheck >= CHECK_EVERY_MS) void this.check();
    }
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.refs -= 1;
      if (this.refs === 0 && this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  /** Never runs while an install is going, nor while another check is. */
  async check(): Promise<void> {
    if (this.snap.installing || this.snap.checking) return;
    await this.run();
  }

  private async run(): Promise<void> {
    const mine = ++this.seq;
    const channel = this.snap.channel;
    this.set({ checking: true });
    let result: UpdateState;
    try {
      result = await this.updates.check(channel);
    } catch {
      result = { state: 'error', code: 'network' };
    }
    // A newer check (another channel) owns the answer now.
    if (mine !== this.seq) return;
    this.set({ checking: false, result, lastCheck: Date.now() });
  }

  setChannel(channel: UpdateChannel): void {
    if (channel === this.snap.channel || this.snap.installing) return;
    write(CHANNEL_KEY, channel);
    this.set({ channel, result: null, checking: false, lastCheck: null });
    void this.run();
  }

  /** "Later": hides this version; a newer one shows again. */
  dismiss(version: string): void {
    write(DISMISSED_KEY, version);
    this.set({ dismissed: version });
  }

  async install(): Promise<void> {
    if (this.snap.installing || this.snap.result?.state !== 'available') return;
    this.set({ installing: true, progress: null, installError: null });
    this.offProgress = this.updates.onProgress((progress) => this.set({ progress }));
    try {
      await this.updates.install(this.snap.channel);
    } catch (e) {
      const code: UpdateErrorCode = e === 'network' || e === 'signature' || e === 'manifest' ? e : 'install';
      this.set({ installError: code });
    } finally {
      this.offProgress?.();
      this.offProgress = null;
      this.set({ installing: false });
    }
  }
}

const controllers = new WeakMap<UpdateControls, UpdatesController>();

/** One controller per update backend, so the banner and the settings share their state. */
export function controllerFor(updates: UpdateControls): UpdatesController {
  let c = controllers.get(updates);
  if (!c) {
    c = new UpdatesController(updates);
    controllers.set(updates, c);
  }
  return c;
}
