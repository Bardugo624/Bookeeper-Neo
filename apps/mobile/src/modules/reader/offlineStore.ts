import { ApiError, type Transport } from '@bookeeper/api';
import { opfsLibrary, streamOf, type OfflineMeta } from './opfsLibrary';

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
    const res = await transport.requestRaw({ method: 'GET', path });
    ctl.signal.throwIfAborted();
    if (res.status < 200 || res.status >= 300) throw new ApiError(res.status, 'download_failed', `Unexpected response (${res.status})`);
    // The transport hands over the whole body: the bar follows the writing to the phone.
    const saved = await opfsLibrary().save(
      { ...meta, sizeBytes: res.bytes.byteLength },
      streamOf(res.bytes),
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
