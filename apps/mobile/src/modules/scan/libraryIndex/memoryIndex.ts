import type { IndexEntry, IndexMeta, LibraryIndex } from './types';

/** In memory: for tests, and where IndexedDB is missing. */
export function memoryIndex(): LibraryIndex & { replaced: number } {
  let items = new Map<string, IndexEntry>();
  let meta: IndexMeta | null = null;
  const self = {
    replaced: 0,
    async get(isbn: string) {
      return items.get(isbn) ?? null;
    },
    async replace(version: string, list: IndexEntry[], syncedAt: number) {
      const next = new Map<string, IndexEntry>();
      for (const e of list) if (!next.has(e.isbn)) next.set(e.isbn, e);
      items = next;
      meta = { version, syncedAt };
      self.replaced += 1;
    },
    async meta() {
      return meta;
    },
  };
  return self;
}
