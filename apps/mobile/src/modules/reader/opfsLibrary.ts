/**
 * The books kept on the phone: the files in the browser's private file system (OPFS), under
 * `books/<sha256>.<ext>`, and their list in IndexedDB `bookeeper-reader`, store `offline`.
 */

export interface OfflineBook {
  sha256: string;
  format: string;
  name: string;
  bookId: string;
  /** The server's file id: positions are kept and sent by it, so a copy opened with no network still resumes and syncs. */
  fileId: string;
  sizeBytes: number;
  savedAt: number;
}

/** What `save` is told about the file; the size is the total progress is measured against. */
export type OfflineMeta = Omit<OfflineBook, 'savedAt'>;

export interface OfflineLibrary {
  has(sha256: string): Promise<boolean>;
  /** Writes the stream; an interrupted save (error or abort) leaves no file and no entry. */
  save(meta: OfflineMeta, stream: ReadableStream<Uint8Array>, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<OfflineBook>;
  /** The kept file, or `null` when there is none. */
  open(sha256: string): Promise<Blob | null>;
  remove(sha256: string): Promise<void>;
  list(): Promise<OfflineBook[]>;
  usage(): Promise<{ count: number; bytes: number }>;
}

/** The list of kept books. */
export interface OfflineIndex {
  get(sha256: string): Promise<OfflineBook | undefined>;
  put(book: OfflineBook): Promise<void>;
  delete(sha256: string): Promise<void>;
  all(): Promise<OfflineBook[]>;
}

export function memoryIndex(): OfflineIndex {
  const rows = new Map<string, OfflineBook>();
  return {
    get: async (sha) => rows.get(sha),
    put: async (b) => void rows.set(b.sha256, b),
    delete: async (sha) => void rows.delete(sha),
    all: async () => [...rows.values()],
  };
}

const DB = 'bookeeper-reader';

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((ok, fail) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

/** Store `offline` of `bookeeper-reader` (version 1: the reader's queue shares the database). */
export function idbIndex(name: string = DB): OfflineIndex {
  let db: Promise<IDBDatabase> | null = null;
  const conn = () => {
    db ??= new Promise<IDBDatabase>((ok, fail) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('offline')) d.createObjectStore('offline', { keyPath: 'sha256' });
        if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { autoIncrement: true });
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => fail(req.error);
    }).catch((e) => {
      db = null;
      throw e;
    });
    return db;
  };
  const store = async (mode: IDBTransactionMode) => (await conn()).transaction('offline', mode).objectStore('offline');
  return {
    get: async (sha) => (await wrap((await store('readonly')).get(sha))) as OfflineBook | undefined,
    put: async (b) => void (await wrap((await store('readwrite')).put(b))),
    delete: async (sha) => void (await wrap((await store('readwrite')).delete(sha))),
    all: async () => (await wrap((await store('readonly')).getAll())) as OfflineBook[],
  };
}

export interface OpfsLibraryOptions {
  /** The folder that holds the files; the real one is `books/` in the origin's private file system. */
  directory?: () => Promise<FileSystemDirectoryHandle>;
  index?: OfflineIndex;
  storage?: Pick<StorageManager, 'persist' | 'persisted'>;
  clock?: () => number;
}

const fileName = (sha256: string, format: string) => `${sha256}.${format.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

async function booksDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('books', { create: true });
}

export function createOpfsLibrary(options: OpfsLibraryOptions = {}): OfflineLibrary {
  const directory = options.directory ?? booksDirectory;
  const index = options.index ?? idbIndex();
  const clock = options.clock ?? Date.now;
  let asked = false;
  const writing = new Set<string>();

  /** The first save asks the browser not to clear the data; the answer changes nothing here. */
  async function persist(): Promise<void> {
    if (asked) return;
    asked = true;
    const storage = options.storage ?? (typeof navigator !== 'undefined' ? navigator.storage : undefined);
    try {
      if (storage?.persist && !(await storage.persisted?.())) await storage.persist();
    } catch {
      /* the copy is kept anyway */
    }
  }

  async function drop(book: OfflineBook | undefined, sha256: string): Promise<void> {
    if (book) {
      const dir = await directory();
      await dir.removeEntry(fileName(sha256, book.format)).catch(() => undefined);
    }
    await index.delete(sha256);
  }

  /** Files without a list entry are saves that a closed tab cut short: they go. */
  async function sweep(dir: FileSystemDirectoryHandle): Promise<void> {
    const keys = (dir as unknown as { keys?: () => AsyncIterable<string> }).keys;
    if (typeof keys !== 'function') return;
    try {
      const kept = new Set((await index.all()).map((b) => fileName(b.sha256, b.format)));
      const names: string[] = [];
      for await (const name of keys.call(dir)) names.push(name);
      for (const name of names) if (!kept.has(name) && !writing.has(name)) await dir.removeEntry(name).catch(() => undefined);
    } catch {
      /* the next save tries again */
    }
  }

  return {
    async has(sha256) {
      const book = await index.get(sha256);
      if (!book) return false;
      try {
        await (await directory()).getFileHandle(fileName(sha256, book.format));
        return true;
      } catch {
        // The browser cleared the file: the entry is stale.
        await index.delete(sha256);
        return false;
      }
    },
    async save(meta, stream, onProgress, signal) {
      await persist();
      signal.throwIfAborted();
      const dir = await directory();
      const name = fileName(meta.sha256, meta.format);
      // Already kept: a second save must never put the good copy at risk.
      const kept = await index.get(meta.sha256);
      if (kept && (await dir.getFileHandle(fileName(kept.sha256, kept.format)).then(() => true, () => false))) {
        onProgress(1);
        return kept;
      }
      await sweep(dir);
      signal.throwIfAborted();
      writing.add(name);
      try {
        return await write(dir, name, meta, stream, onProgress, signal);
      } finally {
        writing.delete(name);
      }
    },
    async open(sha256) {
      const book = await index.get(sha256);
      if (!book) return null;
      try {
        return await (await (await directory()).getFileHandle(fileName(sha256, book.format))).getFile();
      } catch {
        await index.delete(sha256);
        return null;
      }
    },
    async remove(sha256) {
      await drop(await index.get(sha256), sha256);
    },
    list: () => index.all(),
    async usage() {
      const all = await index.all();
      return { count: all.length, bytes: all.reduce((sum, b) => sum + b.sizeBytes, 0) };
    },
  };

  async function write(
    dir: FileSystemDirectoryHandle,
    name: string,
    meta: OfflineMeta,
    stream: ReadableStream<Uint8Array>,
    onProgress: (fraction: number) => void,
    signal: AbortSignal,
  ): Promise<OfflineBook> {
    {
      const handle = await dir.getFileHandle(name, { create: true });
      if (typeof handle.createWritable !== 'function') throw new Error('The browser cannot write files here');
      const writable = await handle.createWritable();
      const reader = stream.getReader();
      let written = 0;
      try {
        for (;;) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          await writable.write(value as unknown as FileSystemWriteChunkType);
          written += value.byteLength;
          onProgress(meta.sizeBytes > 0 ? Math.min(1, written / meta.sizeBytes) : 0);
        }
        signal.throwIfAborted();
        await writable.close();
      } catch (e) {
        await reader.cancel().catch(() => undefined);
        await writable.abort().catch(() => undefined);
        await dir.removeEntry(name).catch(() => undefined);
        throw e;
      }
      const book: OfflineBook = { ...meta, sizeBytes: written, savedAt: clock() };
      try {
        await index.put(book);
      } catch (e) {
        await dir.removeEntry(name).catch(() => undefined);
        throw e;
      }
      onProgress(1);
      return book;
    }
  }
}

let shared: OfflineLibrary | null = null;

/** The phone's one library. */
export function opfsLibrary(): OfflineLibrary {
  shared ??= createOpfsLibrary();
  return shared;
}

/** Test hook: replaces the library. */
export function setLibraryForTest(next: OfflineLibrary | null): void {
  shared = next;
}

/** The bytes as a stream, in pieces, so a save can report how far it got. */
export function streamOf(bytes: Uint8Array, chunk = 256 * 1024): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.byteLength) return controller.close();
      controller.enqueue(bytes.subarray(at, at + chunk));
      at += chunk;
    },
  });
}
