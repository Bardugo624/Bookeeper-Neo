import { ApiError, type PutAnnotation, type PutPosition } from '@bookeeper/api';

export type QueueOp =
  | { type: 'position'; fileId: string; body: PutPosition; at: number }
  | { type: 'annotation'; bookId: string; id: string; body: PutAnnotation; at: number };

/** Pending writes that could not reach the server, oldest first. */
export interface OfflineQueue {
  /** Adds an operation. A later one for the same thing (same file's position, same annotation) replaces the earlier. */
  push(op: QueueOp): Promise<void>;
  list(): Promise<QueueOp[]>;
  /**
   * Hands the operations to `send` in order and removes each once sent.
   * `send` may answer `'skip'` to leave an operation that is not its own.
   * Stops at the first network error and resolves `false`; resolves `true` otherwise.
   * An operation the server rejects for good (a 4xx other than 401, 408, 429) is dropped.
   */
  drain(send: (op: QueueOp) => Promise<void | 'skip'>): Promise<boolean>;
}

/** True when trying again later could work: no answer from the server, a server error, or an expired session. */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof ApiError) {
    if (e.status >= 500 || e.status === 0) return true;
    return e.status === 401 || e.status === 408 || e.status === 429;
  }
  return true;
}

/** The identity two operations share when the later one makes the earlier useless. */
export function opKey(op: QueueOp): string {
  return op.type === 'position' ? `position:${op.fileId}` : `annotation:${op.bookId}:${op.id}`;
}

interface Store {
  entries(): Promise<{ id: number; op: QueueOp }[]>;
  add(op: QueueOp): Promise<void>;
  remove(id: number): Promise<void>;
}

function makeQueue(store: Store): OfflineQueue {
  let chain: Promise<unknown> = Promise.resolve();
  // One drain or push at a time, so an operation is never sent twice.
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };
  return {
    push: (op) =>
      serial(async () => {
        const key = opKey(op);
        for (const e of await store.entries()) if (opKey(e.op) === key) await store.remove(e.id);
        await store.add(op);
      }),
    list: () => serial(async () => (await store.entries()).map((e) => e.op)),
    drain: (send) =>
      serial(async () => {
        for (const e of await store.entries()) {
          try {
            if ((await send(e.op)) === 'skip') continue;
          } catch (err) {
            if (isNetworkError(err)) return false;
          }
          await store.remove(e.id);
        }
        return true;
      }),
  };
}

export function memoryQueue(): OfflineQueue {
  let next = 1;
  let items: { id: number; op: QueueOp }[] = [];
  return makeQueue({
    entries: async () => [...items],
    add: async (op) => void items.push({ id: next++, op }),
    remove: async (id) => void (items = items.filter((i) => i.id !== id)),
  });
}

const DB = 'bookeeper-reader';

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((ok, fail) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

function open(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      // The phone's offline list shares this database; whoever opens first creates both stores.
      if (!db.objectStoreNames.contains('offline')) db.createObjectStore('offline', { keyPath: 'sha256' });
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { autoIncrement: true });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

/**
 * The queue in IndexedDB, database `bookeeper-reader`, store `queue`: it survives a restart.
 * `name` is the database name when it must differ (tests); the app uses the default.
 */
export function idbQueue(name: string = DB): OfflineQueue {
  let db: Promise<IDBDatabase> | null = null;
  const conn = () => {
    db ??= (name === DB ? open() : openNamed(name)).catch((e) => {
      db = null; // a failed open is tried again next time
      throw e;
    });
    return db;
  };
  const store = async (mode: IDBTransactionMode) => (await conn()).transaction('queue', mode).objectStore('queue');
  return makeQueue({
    entries: async () => {
      const s = await store('readonly');
      const [keys, values] = await Promise.all([wrap(s.getAllKeys()), wrap(s.getAll())]);
      return keys.map((k, i) => ({ id: k as number, op: values[i] as QueueOp }));
    },
    add: async (op) => void (await wrap((await store('readwrite')).add(op))),
    remove: async (id) => void (await wrap((await store('readwrite')).delete(id))),
  });
}

function openNamed(name: string): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('offline', { keyPath: 'sha256' });
      req.result.createObjectStore('queue', { autoIncrement: true });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}
