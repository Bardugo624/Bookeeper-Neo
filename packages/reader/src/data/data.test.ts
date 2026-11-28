import 'fake-indexeddb/auto';
import { ApiError, type AnnotationOut, type PutAnnotation, type PutPosition } from '@bookeeper/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Relocation } from '../engine/protocol';
import { decideResume } from '../model/resume';
import {
  createAnnotationStore,
  createPositionKeeper,
  idbQueue,
  memoryQueue,
  sourcesFrom,
  type OfflineQueue,
  type ReaderBackend,
} from './index';

const reloc = (fraction: number, cfi = `cfi-${fraction}`): Relocation => ({
  cfi, fraction, sectionIndex: 0, sectionFraction: 0, tocHref: null, atStart: false, atEnd: false,
});

class Net extends Error {}

function fakeBackend(queue: OfflineQueue = memoryQueue()) {
  const state = { online: true, positions: [] as PutPosition[], remote: new Map<string, AnnotationOut>() };
  const backend = {
    deviceId: 'me',
    queue,
    putPosition: vi.fn(async (b: PutPosition) => {
      if (!state.online) throw new Net('offline');
      state.positions.push(b);
    }),
    putAnnotation: vi.fn(async (id: string, b: PutAnnotation): Promise<AnnotationOut> => {
      if (!state.online) throw new Net('offline');
      const old = state.remote.get(id);
      if (old && old.updated_at >= b.updated_at) return old;
      const row: AnnotationOut = { ...b, id, deleted_at: b.deleted ? b.updated_at : null };
      state.remote.set(id, row);
      return row;
    }),
    listAnnotations: vi.fn(async (since?: number) => {
      if (!state.online) throw new Net('offline');
      return [...state.remote.values()].filter((r) =>
        since === undefined ? r.deleted_at == null : r.updated_at > since,
      );
    }),
  } as unknown as ReaderBackend;
  return { backend, state };
}

const memStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('position keeper', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves_two_seconds_after_the_last_turn', async () => {
    const { backend, state } = fakeBackend();
    const k = createPositionKeeper(backend, 'f1', memStorage(), () => 100);
    k.record(reloc(0.1));
    await vi.advanceTimersByTimeAsync(1500);
    k.record(reloc(0.2));
    await vi.advanceTimersByTimeAsync(1999);
    expect(state.positions).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.positions).toEqual([{ kind: 'cfi', value: 'cfi-0.2', percent: 20 }]);
  });

  it('flush_saves_immediately', async () => {
    const { backend, state } = fakeBackend();
    const k = createPositionKeeper(backend, 'f1', memStorage(), () => 100);
    k.record(reloc(0.3));
    await k.flush();
    expect(state.positions).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(state.positions).toHaveLength(1);
  });

  it('local_position_is_remembered_per_file', () => {
    const { backend } = fakeBackend();
    const storage = memStorage();
    const a = createPositionKeeper(backend, 'f1', storage, () => 7);
    const b = createPositionKeeper(backend, 'f2', storage, () => 8);
    a.record(reloc(0.5, 'x'));
    expect(a.local()).toEqual({ value: 'x', percent: 50, at: 7 });
    expect(b.local()).toBeNull();
    expect(storage.getItem('bookeeper.reader.position.f1')).not.toBeNull();
  });

  it('offline_saves_wait_in_the_queue_and_leave_later', async () => {
    const { backend, state } = fakeBackend();
    const k = createPositionKeeper(backend, 'f1', memStorage(), () => 100);
    state.online = false;
    k.record(reloc(0.1));
    await k.flush();
    k.record(reloc(0.2));
    await k.flush();
    const q = await backend.queue.list();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ type: 'position', fileId: 'f1', body: { value: 'cfi-0.2' } });
    state.online = true;
    k.record(reloc(0.4));
    await k.flush();
    expect(state.positions.map((p) => p.value)).toEqual(['cfi-0.2', 'cfi-0.4']);
    expect(await backend.queue.list()).toEqual([]);
  });
});

describe('annotation store', () => {
  let t = 1000;
  let n = 0;
  const clock = () => t;
  const uuid = () => `id-${++n}`;
  const book = { bookId: 'b1', sha256: 'sha' };
  const hl = { kind: 'highlight' as const, cfi: 'c', text: 'hi', color: 'amber', percent: 10 };
  beforeEach(() => ((t = 1000), (n = 0)));

  it('add_is_visible_at_once_and_sent', async () => {
    const { backend, state } = fakeBackend();
    const s = createAnnotationStore(backend, book, clock, uuid);
    const seen = vi.fn();
    s.subscribe(seen);
    const p = s.add(hl);
    expect(s.list().map((a) => a.id)).toEqual(['id-1']);
    expect(seen).toHaveBeenCalled();
    await p;
    expect(state.remote.get('id-1')).toMatchObject({ file_sha256: 'sha', color: 'amber', deleted_at: null });
  });

  it('a_newer_remote_edit_wins', async () => {
    const { backend, state } = fakeBackend();
    const s = createAnnotationStore(backend, book, clock, uuid);
    await s.add(hl);
    state.remote.set('id-1', { ...state.remote.get('id-1')!, note: 'from phone', updated_at: 2000 });
    await s.sync();
    expect(s.list()[0]!.note).toBe('from phone');
    // an older remote copy does not overwrite a newer local edit
    t = 3000;
    await s.update('id-1', { note: 'mine' });
    state.remote.set('id-1', { ...state.remote.get('id-1')!, note: 'stale', updated_at: 2500 });
    await s.sync();
    expect(s.list()[0]!.note).toBe('mine');
  });

  it('remove_sends_a_tombstone', async () => {
    const { backend, state } = fakeBackend();
    const s = createAnnotationStore(backend, book, clock, uuid);
    await s.add(hl);
    t = 1100;
    await s.remove('id-1');
    expect(s.list()).toEqual([]);
    expect(state.remote.get('id-1')).toMatchObject({ deleted_at: 1100, updated_at: 1100 });
    expect(backend.putAnnotation).toHaveBeenLastCalledWith('id-1', expect.objectContaining({ deleted: true }));
  });

  it('pull_since_merges_tombstones', async () => {
    const { backend, state } = fakeBackend();
    const s = createAnnotationStore(backend, book, clock, uuid);
    const row = (id: string, updated_at: number, deleted_at: number | null = null): AnnotationOut => ({
      id, file_sha256: 'sha', kind: 'highlight', cfi: 'c', text: '', color: 'sage', note: null,
      percent: 5, chapter: null, created_at: 1, updated_at, deleted_at,
    });
    state.remote.set('a', row('a', 10));
    state.remote.set('b', row('b', 11));
    await s.sync();
    expect(s.list().map((a) => a.id)).toEqual(['a', 'b']);
    state.remote.set('a', row('a', 20, 20));
    state.remote.set('c', row('c', 21));
    await s.sync();
    // The pull overlaps the bookmark: another device's clock may be behind.
    expect(backend.listAnnotations).toHaveBeenLastCalledWith(0);
    expect(s.list().map((a) => a.id)).toEqual(['b', 'c']);
    state.remote.set('d', row('d', 21));
    await s.sync();
    expect(s.list().map((a) => a.id)).toEqual(['b', 'c', 'd']);
  });

  it('offline_edits_survive_a_restart_with_idb_queue', async () => {
    const name = `bookeeper-reader-test-${Math.random()}`;
    const first = fakeBackend(idbQueue(name));
    first.state.online = false;
    const s1 = createAnnotationStore(first.backend, book, clock, uuid);
    await s1.add(hl);
    expect(first.state.remote.size).toBe(0);

    // restart: a new queue on the same database, a new store
    const second = fakeBackend(idbQueue(name));
    const s2 = createAnnotationStore(second.backend, book, clock, uuid);
    await s2.sync();
    expect(second.state.remote.get('id-1')).toBeDefined();
    expect(s2.list().map((a) => a.id)).toEqual(['id-1']);
    expect(await second.backend.queue.list()).toEqual([]);
  });
});

describe('queue', () => {
  for (const [label, make] of [
    ['memory', () => memoryQueue()],
    ['idb', () => idbQueue(`q-${Math.random()}`)],
  ] as const) {
    it(`queue_drains_in_order_and_stops_at_the_first_network_error (${label})`, async () => {
      const q = make();
      const pos = (n: number) => ({ type: 'position' as const, fileId: `f${n}`, body: { kind: 'cfi', value: `${n}`, percent: n }, at: n });
      for (const n of [1, 2, 3]) await q.push(pos(n));
      const sent: string[] = [];
      const ok = await q.drain(async (op) => {
        if (op.type === 'position' && op.fileId === 'f2') throw new Net('down');
        sent.push((op as { fileId: string }).fileId);
      });
      expect(ok).toBe(false);
      expect(sent).toEqual(['f1']);
      expect((await q.list()).map((o) => (o as { fileId: string }).fileId)).toEqual(['f2', 'f3']);
      expect(await q.drain(async (op) => void sent.push((op as { fileId: string }).fileId))).toBe(true);
      expect(sent).toEqual(['f1', 'f2', 'f3']);
      expect(await q.list()).toEqual([]);
    });
  }

  it('drops_what_the_server_rejects_for_good', async () => {
    const q = memoryQueue();
    await q.push({ type: 'position', fileId: 'f', body: { kind: 'cfi', value: 'x', percent: 1 }, at: 1 });
    expect(await q.drain(async () => { throw new ApiError(422, 'invalid', 'no'); })).toBe(true);
    expect(await q.list()).toEqual([]);
  });
});

describe('sourcesFrom', () => {
  it('positions_and_hand_typed_page_become_sources', () => {
    const pos = (o: Record<string, unknown>) => ({
      device_id: 'phone', device_kind: 'mobile', device_name: 'x', file_id: 'f1', kind: 'cfi',
      percent: 45, updated_at: 2000, value: 'epubcfi(/6)', ...o,
    }) as never;
    const reading = { book_id: 'b', status: 'reading', updated_at: 1, current_page: 212, progress_percent: 45, progress_at: 3000 } as never;
    const sources = sourcesFrom(
      [pos({}), pos({ device_id: null, kind: 'koreader', device_kind: null, value: '/body', file_id: 'f9' }), pos({ percent: null })],
      reading,
      'f1',
      'me',
    );
    expect(sources).toEqual([
      { kind: 'device', deviceId: 'phone', deviceKind: 'mobile', sameFile: true, value: 'epubcfi(/6)', percent: 45, at: 2000 },
      { kind: 'device', deviceId: '', deviceKind: 'koreader', sameFile: false, value: null, percent: 45, at: 2000 },
      { kind: 'page', page: 212, percent: 45, at: 3000 },
    ]);
    const offer = decideResume({ value: 'v', percent: 10, at: 100 }, sources, 'me');
    expect(offer?.page).toBe(212);
    expect(sourcesFrom([pos({ updated_at: 3000 })], reading, 'f1', 'me').some((s) => s.kind === 'page')).toBe(false);
  });
});
