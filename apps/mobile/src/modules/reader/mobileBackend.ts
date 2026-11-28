import { ApiError, type Transport } from '@bookeeper/api';
import type { Client } from '../../session';
import type { OfflineQueue, ReaderBackend } from '@bookeeper/reader/data';
import { noOfflineFiles, type OfflineFiles } from './offlineFiles';

const P = '/api/v1';
const enc = encodeURIComponent;

export interface MobileBackendInput {
  client: Client;
  /** The session's transport: it adds the token and renews it. */
  transport: Transport;
  bookId: string;
  fileId: string;
  deviceId: string;
  queue: OfflineQueue;
  offline?: OfflineFiles;
  /** What the offline copy is looked up by. */
  file?: { sha256: string; format: string };
}

function messageOf(bytes: Uint8Array): { code: string; message: string } {
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes)) as { error_code?: unknown; message?: unknown };
    return { code: typeof body.error_code === 'string' ? body.error_code : 'unknown', message: typeof body.message === 'string' ? body.message : '' };
  } catch {
    return { code: 'unknown', message: '' };
  }
}

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // The browser starts the save on the click; the URL can go once it has had the chance.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** What the phone hands to the reader, already bound to one book and one file. */
export function createMobileBackend(input: MobileBackendInput): ReaderBackend {
  const { client, transport, bookId, fileId, deviceId, queue, offline = noOfflineFiles, file } = input;
  return {
    deviceId,
    async loadFile(signal, onProgress) {
      if (file) {
        const kept = await offline.read(file.sha256, file.format).catch(() => null);
        if (kept) {
          onProgress(1);
          return kept;
        }
      }
      if (!transport.requestRaw) throw new ApiError(0, 'unsupported', 'raw requests unsupported');
      signal.throwIfAborted();
      onProgress(0);
      const res = await transport.requestRaw({ method: 'GET', path: `${P}/books/${enc(bookId)}/files/${enc(fileId)}/content` });
      signal.throwIfAborted();
      if (res.status < 200 || res.status >= 300) {
        const { code, message } = messageOf(res.bytes);
        throw new ApiError(res.status, code, message || `Unexpected response (${res.status})`);
      }
      // The transport hands over the whole body at once: the progress is 0, then 1.
      onProgress(1);
      return new Blob([res.bytes as BlobPart], { type: res.contentType ?? 'application/octet-stream' });
    },
    listPositions: () => client.listPositions(bookId),
    async putPosition(body) {
      await client.putPosition(bookId, fileId, body);
    },
    getReading: () => client.getReading(bookId),
    async markRead() {
      await client.setReading(bookId, { status: 'read', finished_at: Math.floor(Date.now() / 1000) });
    },
    listAnnotations: (since) => client.listAnnotations(bookId, since),
    putAnnotation: (id, body) => client.putAnnotation(bookId, id, body),
    openExternal(url) {
      window.open(url, '_blank', 'noopener');
    },
    async saveText(fileName, text) {
      const shared = new File([text], fileName, { type: 'text/markdown' });
      if (typeof navigator.canShare === 'function' && typeof navigator.share === 'function' && navigator.canShare({ files: [shared] })) {
        try {
          await navigator.share({ files: [shared], title: fileName });
        } catch (e) {
          // The person closed the sheet: nothing went wrong.
          if (!(e instanceof DOMException && e.name === 'AbortError')) throw e;
        }
        return;
      }
      download(fileName, shared);
    },
    queue,
  };
}
