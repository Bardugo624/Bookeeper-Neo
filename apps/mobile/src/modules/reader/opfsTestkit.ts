import { vi } from 'vitest';
import { createOpfsLibrary, memoryIndex, type OfflineLibrary, type OpfsLibraryOptions } from './opfsLibrary';

/** An in-memory OPFS folder: a file shows up only when its writable is closed, like the real one. */
export function fakeDirectory() {
  const files = new Map<string, Uint8Array>();
  const handle = (name: string) =>
    ({
      kind: 'file',
      name,
      async getFile() {
        const bytes = files.get(name);
        if (!bytes) throw new DOMException('gone', 'NotFoundError');
        return new File([bytes as BlobPart], name);
      },
      async createWritable() {
        const parts: Uint8Array[] = [];
        return {
          async write(chunk: Uint8Array) {
            parts.push(new Uint8Array(chunk));
          },
          async close() {
            const all = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
            let at = 0;
            for (const p of parts) {
              all.set(p, at);
              at += p.byteLength;
            }
            files.set(name, all);
          },
          async abort() {
            parts.length = 0;
          },
        };
      },
    }) as unknown as FileSystemFileHandle;
  const dir = {
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      if (!files.has(name) && !opts?.create) throw new DOMException('missing', 'NotFoundError');
      return handle(name);
    },
    async removeEntry(name: string) {
      if (!files.delete(name)) throw new DOMException('missing', 'NotFoundError');
    },
  } as unknown as FileSystemDirectoryHandle;
  return { dir, files };
}

export function fakeLibrary(over: OpfsLibraryOptions = {}) {
  const { dir, files } = fakeDirectory();
  const persist = vi.fn(async () => true);
  const library: OfflineLibrary = createOpfsLibrary({
    directory: async () => dir,
    index: memoryIndex(),
    storage: { persist, persisted: async () => false },
    ...over,
  });
  return { library, files, persist };
}
