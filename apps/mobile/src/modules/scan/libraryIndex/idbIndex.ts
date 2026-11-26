import type { IndexEntry, IndexMeta, LibraryIndex } from './types';

const ITEMS = 'items';
const META = 'meta';
const META_KEY = 'meta';

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(ITEMS, { keyPath: 'isbn' });
      request.result.createObjectStore(META);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** One IndexedDB database per library: a phone paired elsewhere never sees these entries. */
export function idbIndex(libraryId: string): LibraryIndex {
  let db: Promise<IDBDatabase> | undefined;
  const connect = () => (db ??= open(`bookeeper-isbn-${libraryId}`));
  return {
    async get(isbn) {
      const tx = (await connect()).transaction(ITEMS, 'readonly');
      return ((await wrap(tx.objectStore(ITEMS).get(isbn))) as IndexEntry | undefined) ?? null;
    },
    async replace(version, items, syncedAt) {
      const tx = (await connect()).transaction([ITEMS, META], 'readwrite');
      const store = tx.objectStore(ITEMS);
      store.clear();
      for (const e of items) store.add(e).onerror = (ev) => ev.preventDefault(); // a second copy keeps the first
      tx.objectStore(META).put({ version, syncedAt } satisfies IndexMeta, META_KEY);
      await done(tx);
    },
    async meta() {
      const tx = (await connect()).transaction(META, 'readonly');
      return ((await wrap(tx.objectStore(META).get(META_KEY))) as IndexMeta | undefined) ?? null;
    },
  };
}
