import { ApiError, type Transport } from '@bookeeper/api';
import { opfsLibrary, type OfflineMeta } from './opfsLibrary';

/** Where a file is: not on the phone, on its way, or kept. */
export interface OfflineState {
  status: 'none' | 'saving' | 'saved';
  /** 0..1 while saving. */
  progress: number;
  sizeBytes: number;
  /** The last save failed (not a cancel). */
  failed: boolean;
}

const NONE: OfflineState = { status: 'none', progress: 0, sizeBytes: 0, failed: false };
const states = new Map<string, OfflineState>();
const jobs = new Map<string, AbortController>();
const listeners = new Set<() => void>();

const set = (sha: string, state: OfflineState) => {
  states.set(sha, state);
  listeners.forEach((l) => l());
};

export const offlineState = (sha: string): OfflineState => states.get(sha) ?? NONE;

export function subscribeOffline(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Reads the library once for a file, unless a save is running. */
export async function refreshOffline(sha: string): Promise<void> {
  if (jobs.has(sha)) return;
  const kept = (await opfsLibrary().list().catch(() => [])).find((b) => b.sha256 === sha);
  if (jobs.has(sha)) return;
  if (kept && (await opfsLibrary().has(sha).catch(() => false))) set(sha, { status: 'saved', progress: 1, sizeBytes: kept.sizeBytes, failed: false });
  else set(sha, NONE);
}

const PIECE = 1024 * 1024;

/** The file as a stream, asked for a piece at a time: a server that ignores `Range` sends it whole in one. */
function rangedStream(transport: Transport, path: string, total: number, signal: AbortSignal): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      signal.throwIfAborted();
      const res = await transport.requestRaw!({ method: 'GET', path, headers: { range: `bytes=${at}-${at + PIECE - 1}` } });
      signal.throwIfAborted();
      if (res.status === 416 && at > 0) return controller.close();
      if (res.status !== 200 && res.status !== 206) throw new ApiError(res.status, 'download_failed', `Unexpected response (${res.status})`);
      if (res.bytes.byteLength > 0) controller.enqueue(res.bytes);
      at += res.bytes.byteLength;
      const whole = res.status === 200;
      if (whole || res.bytes.byteLength === 0 || (total > 0 ? at >= total : res.bytes.byteLength < PIECE)) controller.close();
    },
  });
}

/** Fetches the file with the session's token and keeps it on the phone. */
export async function downloadOffline(meta: OfflineMeta, fileId: string, transport: Transport): Promise<void> {
  const sha = meta.sha256;
  if (jobs.has(sha)) return;
  const ctl = new AbortController();
  jobs.set(sha, ctl);
  set(sha, { status: 'saving', progress: 0, sizeBytes: meta.sizeBytes, failed: false });
  try {
    if (!transport.requestRaw) throw new ApiError(0, 'unsupported', 'raw requests unsupported');
    const path = `/api/v1/books/${encodeURIComponent(meta.bookId)}/files/${encodeURIComponent(fileId)}/content`;
    // The file arrives piece by piece (Range), so the bar and «Annulla» follow the real transfer.
    const saved = await opfsLibrary().save(
      meta,
      rangedStream(transport, path, meta.sizeBytes, ctl.signal),
      (f) => set(sha, { status: 'saving', progress: f, sizeBytes: meta.sizeBytes, failed: false }),
      ctl.signal,
    );
    set(sha, { status: 'saved', progress: 1, sizeBytes: saved.sizeBytes, failed: false });
  } catch {
    set(sha, { ...NONE, failed: !ctl.signal.aborted });
  } finally {
    jobs.delete(sha);
  }
}

export function cancelOffline(sha: string): void {
  jobs.get(sha)?.abort();
}

export async function removeOffline(sha: string): Promise<void> {
  await opfsLibrary().remove(sha);
  set(sha, NONE);
}

/** Test hook. */
export function resetOfflineForTest(): void {
  jobs.forEach((j) => j.abort());
  jobs.clear();
  states.clear();
}
