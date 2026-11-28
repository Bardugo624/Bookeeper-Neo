import { ApiError, type PutAnnotation, type PutPosition, type PutReading } from '@bookeeper/api';
import type { OfflineQueue, ReaderBackend } from '@bookeeper/reader/data';
import type { Platform } from '../../platform';
import type { Client } from '../../session';

export interface DesktopBackendInput {
  platform: Platform;
  client: Pick<
    Client,
    'listPositions' | 'putPosition' | 'getReading' | 'setReading' | 'listAnnotations' | 'putAnnotation'
  >;
  queue: OfflineQueue;
  bookId: string;
  file: { id: string; sha256: string; format: string };
  /** `token` is read at each request: a renewed token must not rebuild the backend. */
  connection: { id: string; deviceId: string; token: () => string | null };
  /** Name of the file type in the save window. */
  saveFilterName: string;
}

/** Reads the answer body, telling the caller how far along it is (0 to 1; unknown sizes only report the end). */
async function readBody(res: Response, onProgress: (fraction: number) => void): Promise<Blob> {
  const total = Number(res.headers.get('content-length'));
  if (!res.body || !Number.isFinite(total) || total <= 0) {
    const blob = await res.blob();
    onProgress(1);
    return blob;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let done = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    chunks.push(part.value as Uint8Array<ArrayBuffer>);
    done += part.value.byteLength;
    onProgress(Math.min(1, done / total));
  }
  onProgress(1);
  return new Blob(chunks, { type: res.headers.get('content-type') ?? '' });
}

/** What `ReaderApp` needs on the computer, bound to one book and one file. */
export function createDesktopBackend(input: DesktopBackendInput): ReaderBackend {
  const { platform, client, queue, bookId, file, connection } = input;
  return {
    deviceId: connection.deviceId,
    queue,
    async loadFile(signal, onProgress) {
      // The platform copies the file into the app's cache (checked against its hash) and answers where it is.
      const token = connection.token();
      const url = await platform.readerFile({
        connectionId: connection.id,
        bookId,
        fileId: file.id,
        sha256: file.sha256,
        format: file.format,
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      });
      const res = await fetch(url, { signal });
      if (!res.ok) throw new ApiError(res.status, 'unknown', `The file could not be read (${res.status})`);
      return readBody(res, onProgress);
    },
    listPositions: () => client.listPositions(bookId),
    async putPosition(body: PutPosition) {
      await client.putPosition(bookId, file.id, body);
    },
    getReading: () => client.getReading(bookId),
    async markRead() {
      // The rating and the note stay as they are: the core fills the dates and the page it owns.
      const current = await client.getReading(bookId);
      const body: PutReading = {
        status: 'read',
        started_at: current?.started_at ?? null,
        rating: current?.rating ?? null,
        note: current?.note ?? null,
      };
      await client.setReading(bookId, body);
    },
    listAnnotations: (since) => client.listAnnotations(bookId, since),
    putAnnotation: (id: string, body: PutAnnotation) => client.putAnnotation(bookId, id, body),
    openExternal(url) {
      platform.openUrl(url).catch(() => undefined);
    },
    async saveText(fileName, text) {
      await platform.saveFile({
        suggestedName: fileName,
        bytes: new TextEncoder().encode(text),
        mime: 'text/markdown',
        filters: [{ name: input.saveFilterName, extensions: ['md'] }],
      });
    },
  };
}
