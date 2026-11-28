import type { AnnotationOut, PutAnnotation } from '@bookeeper/api';
import { isNetworkError } from './queue';
import type { Clock, ReaderBackend } from './types';

/** Pull window overlap: devices' clocks differ and edits can share a second. merge ignores repeats. */
const OVERLAP_S = 600;

export interface NewAnnotation {
  kind: 'highlight' | 'bookmark';
  cfi: string;
  text?: string;
  color?: string | null;
  note?: string | null;
  percent: number;
  chapter?: string | null;
}
export type AnnotationPatch = Partial<Pick<AnnotationOut, 'color' | 'note' | 'text' | 'chapter'>>;

export interface AnnotationStore {
  /** The live annotations, in book order. */
  list(): AnnotationOut[];
  subscribe(fn: () => void): () => void;
  add(input: NewAnnotation): Promise<AnnotationOut>;
  update(id: string, patch: AnnotationPatch): Promise<AnnotationOut | null>;
  /** Writes a tombstone. */
  remove(id: string): Promise<void>;
  /** Sends the waiting changes, then takes the new ones. False when the network was missing. */
  sync(): Promise<boolean>;
}

function toPut(a: AnnotationOut): PutAnnotation {
  return {
    file_sha256: a.file_sha256,
    kind: a.kind,
    cfi: a.cfi,
    text: a.text,
    color: a.color ?? null,
    note: a.note ?? null,
    percent: a.percent,
    chapter: a.chapter ?? null,
    created_at: a.created_at,
    updated_at: a.updated_at,
    deleted: a.deleted_at != null,
  };
}

export function createAnnotationStore(
  backend: ReaderBackend,
  book: { bookId: string; sha256: string },
  clock: Clock,
  uuid: () => string,
): AnnotationStore {
  const all = new Map<string, AnnotationOut>();
  const listeners = new Set<() => void>();
  let since: number | undefined;
  const notify = () => listeners.forEach((fn) => fn());

  /** A write the server accepted moves `since` too, once a first pull has set it. */
  function written(r: AnnotationOut): void {
    if (since !== undefined) since = Math.max(since, r.updated_at);
    merge(r);
  }

  /** The last edit wins; a tie keeps what is here. */
  function merge(r: AnnotationOut): boolean {
    const l = all.get(r.id);
    if (l && l.updated_at >= r.updated_at) return false;
    all.set(r.id, r);
    return true;
  }

  // Edits made offline before a restart come back from the queue.
  const hydrated = backend.queue
    .list()
    .then((ops) => {
      let changed = false;
      for (const op of ops) {
        if (op.type !== 'annotation' || op.bookId !== book.bookId) continue;
        const b = op.body;
        changed =
          merge({
            id: op.id,
            file_sha256: b.file_sha256,
            kind: b.kind,
            cfi: b.cfi,
            text: b.text,
            color: b.color ?? null,
            note: b.note ?? null,
            percent: b.percent,
            chapter: b.chapter ?? null,
            created_at: b.created_at,
            updated_at: b.updated_at,
            deleted_at: b.deleted ? b.updated_at : null,
          }) || changed;
      }
      if (changed) notify();
    })
    .catch(() => undefined);

  async function push(a: AnnotationOut): Promise<void> {
    try {
      written(await backend.putAnnotation(a.id, toPut(a)));
    } catch (e) {
      // A rejection is final: the edit stays here and is not retried.
      if (isNetworkError(e)) {
        await backend.queue.push({ type: 'annotation', bookId: book.bookId, id: a.id, body: toPut(a), at: clock() });
      }
    }
  }

  return {
    list: () =>
      [...all.values()].filter((a) => a.deleted_at == null).sort((a, b) => a.percent - b.percent || a.created_at - b.created_at),
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    async add(input) {
      const now = clock();
      const a: AnnotationOut = {
        id: uuid(),
        file_sha256: book.sha256,
        kind: input.kind,
        cfi: input.cfi,
        text: input.text ?? '',
        color: input.kind === 'highlight' ? (input.color ?? null) : null,
        note: input.note ?? null,
        percent: input.percent,
        chapter: input.chapter ?? null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      all.set(a.id, a);
      notify();
      await push(a);
      notify();
      return all.get(a.id) ?? a;
    },
    async update(id, patch) {
      await hydrated;
      const l = all.get(id);
      if (!l || l.deleted_at != null) return null;
      // The edit must be newer than what it replaces, even within the same second.
      const a = { ...l, ...patch, updated_at: Math.max(clock(), l.updated_at + 1) };
      all.set(id, a);
      notify();
      await push(a);
      notify();
      return all.get(id) ?? a;
    },
    async remove(id) {
      await hydrated;
      const l = all.get(id);
      if (!l || l.deleted_at != null) return;
      const at = Math.max(clock(), l.updated_at + 1);
      const a = { ...l, updated_at: at, deleted_at: at };
      all.set(id, a);
      notify();
      await push(a);
    },
    async sync() {
      await hydrated;
      const drained = await backend.queue.drain(async (op) => {
        if (op.type !== 'annotation' || op.bookId !== book.bookId) return 'skip';
        written(await backend.putAnnotation(op.id, op.body));
      });
      if (!drained) return false;
      try {
        const news = await backend.listAnnotations(since === undefined ? undefined : Math.max(0, since - OVERLAP_S));
        let changed = false;
        for (const r of news) {
          since = Math.max(since ?? 0, r.updated_at);
          changed = merge(r) || changed;
        }
        // After a full load, later pulls must ask with `since` so they also
        // bring tombstones, even when this first load was empty.
        since ??= 0;
        if (changed) notify();
        return true;
      } catch (e) {
        if (isNetworkError(e)) return false;
        throw e;
      }
    },
  };
}
