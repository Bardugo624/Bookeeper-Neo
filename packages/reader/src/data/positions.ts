import type { Relocation } from '../engine/protocol';
import type { LocalPosition } from '../model/resume';
import { isNetworkError } from './queue';
import type { Clock, ReaderBackend } from './types';

/** Delay between the last page turn and the save on the server. */
export const SAVE_DELAY_MS = 2000;

export interface PositionKeeper {
  /** Saves locally at once and on the server after 2000 ms without another call. */
  record(relocation: Relocation): void;
  /** Saves on the server now. */
  flush(): Promise<void>;
  /** The last position on this device. */
  local(): LocalPosition | null;
  /** Sends what waited in the queue. */
  drain(): Promise<boolean>;
}

const KEY = (fileId: string) => `bookeeper.reader.position.${fileId}`;

function readLocal(storage: Pick<Storage, 'getItem'>, fileId: string): LocalPosition | null {
  try {
    const raw = storage.getItem(KEY(fileId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LocalPosition> | null;
    if (!v || typeof v.value !== 'string' || typeof v.percent !== 'number' || typeof v.at !== 'number') return null;
    return { value: v.value, percent: v.percent, at: v.at };
  } catch {
    return null;
  }
}

export function createPositionKeeper(
  backend: ReaderBackend,
  fileId: string,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  clock: Clock,
): PositionKeeper {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  // The newest position, kept in memory in case the storage refuses it.
  let latest: LocalPosition | null = null;
  // Saves run one after another, so the server ends on the newest.
  let chain: Promise<void> = Promise.resolve();

  const drain = () =>
    backend.queue.drain(async (op) => {
      if (op.type !== 'position' || op.fileId !== fileId) return 'skip';
      await backend.putPosition(op.body);
    });

  function send(): Promise<void> {
    const run = chain.then(sendNow);
    chain = run.catch(() => undefined);
    return run;
  }

  async function sendNow(): Promise<void> {
    const pos = latest ?? readLocal(storage, fileId);
    dirty = false;
    if (!pos) return;
    const body = { kind: 'cfi', value: pos.value, percent: pos.percent };
    // Older pending saves go first, so the server ends on the newest.
    if (await drain()) {
      try {
        await backend.putPosition(body);
        return;
      } catch (e) {
        if (!isNetworkError(e)) return;
      }
    }
    await backend.queue.push({ type: 'position', fileId, body, at: pos.at });
  }

  return {
    record(r) {
      const pos: LocalPosition = { value: r.cfi, percent: r.fraction * 100, at: clock() };
      latest = pos;
      try {
        storage.setItem(KEY(fileId), JSON.stringify(pos));
      } catch {
        // A full or blocked storage must not stop the reading.
      }
      dirty = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        send().catch(() => undefined);
      }, SAVE_DELAY_MS);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (dirty) await send();
      else await chain;
    },
    local: () => readLocal(storage, fileId),
    drain,
  };
}
