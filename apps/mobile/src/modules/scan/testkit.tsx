import { vi } from 'vitest';
import type { BookOut, Metadata } from '@bookeeper/api';
import { renderMobile } from '../../app/testing';
import { fakePlatform, type FakePlatform, type Handler, type RecordedCall } from '../../platform/testing';
import type { CameraSession } from '../../platform';
import { ME, ok, pair } from '../../session/fixtures';
import { memoryIndex, setIndexFactoryForTest, type IndexEntry, type LibraryIndex } from './libraryIndex';
import { module } from './routes';

export const ISBN13 = '9780306406157';
export const ISBN10 = '0306406152';

export const book = (over: Partial<BookOut> = {}): BookOut =>
  ({ id: 'b1', title: 'Dune', authors: ['Frank Herbert'], on_loan: false, created_at: 1, updated_at: 1, ...over }) as BookOut;

export const meta = (over: Partial<Metadata> = {}): Metadata => ({
  title: 'Emma',
  authors: ['Jane Austen'],
  cover_candidates: [],
  sources: ['x'],
  ...over,
});

export const err = (status: number, code: string, headers?: { retryAfter?: number }) => ({
  status,
  body: { error_code: code, message: 'x' },
  ...headers,
});

export interface Server {
  books?: BookOut[];
  lookup?: Metadata | ReturnType<typeof err>;
  create?: (body: unknown) => ReturnType<typeof ok> | ReturnType<typeof err>;
  role?: string;
  /** What the ISBN index answers; without it the call fails. */
  index?: (version: string | null) => ReturnType<typeof ok> | ReturnType<typeof err>;
  /** Answers first; `undefined` falls through to the defaults. */
  extra?: (call: RecordedCall) => ReturnType<typeof ok> | ReturnType<typeof err> | undefined;
}

/** An in-memory server for the calls the scan module makes. */
export function server(s: Server = {}): Handler {
  return (call: RecordedCall) => {
    const url = new URL(call.path, 'http://x');
    const p = url.pathname;
    const own = s.extra?.(call);
    if (own) return own;
    if (p === '/api/v1/me') return ok({ ...ME, user: { ...ME.user, role: s.role ?? 'owner' } });
    if (p === '/api/v1/books/isbn-index' && s.index) return s.index(url.searchParams.get('version'));
    if (p === '/api/v1/shelves') return ok({ items: [{ id: 's1', name: 'Salotto' }], total: 1 });
    if (p === '/api/v1/books' && call.method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      const items = (s.books ?? []).filter((b) => b.isbn_13 === q || b.isbn_10 === q);
      return ok({ items, total: items.length, limit: 10, offset: 0 });
    }
    if (p === '/api/v1/books' && call.method === 'POST') return (s.create ?? (() => ok(book({ id: 'new', title: 'Emma' }))))(call.body);
    if (p.startsWith('/api/v1/lookup/isbn/')) {
      const l = s.lookup ?? err(404, 'not_found');
      return 'status' in l ? l : ok(l);
    }
    if (p.endsWith('/cover/fetch')) return ok({ cover_color: '#123456', source_url: 'x' });
    return err(404, 'not_found');
  };
}

export interface Opened {
  stops: ReturnType<typeof vi.fn>[];
}

/** A platform whose camera counts the tracks it opened and stopped. */
export function scanPlatform(s: Server = {}, over: Partial<FakePlatform> & { online?: boolean } = {}) {
  const platform = fakePlatform({ handler: server(s), ...over });
  const stops: ReturnType<typeof vi.fn>[] = [];
  if (!over.camera) {
    platform.camera.open = vi.fn(async (deviceId?: string): Promise<CameraSession> => {
      const stop = vi.fn();
      stops.push(stop);
      return { stream: {} as MediaStream, deviceId: deviceId ?? 'rear', torchSupported: true, setTorch: vi.fn(async () => undefined), stop };
    });
  }
  return { platform, stops };
}

export const entry = (over: Partial<IndexEntry> = {}): IndexEntry => ({
  isbn: ISBN13,
  book_id: 'b1',
  title: 'Dune',
  authors: ['Frank Herbert'],
  shelf: { id: 's1', name: 'Salotto' },
  row_index: 1,
  slot_index: 0,
  ...over,
});

/** Every render starts with its own in-memory index, which a test may fill beforehand. */
export function renderScan(platform: FakePlatform, route = '/scan', index: LibraryIndex = memoryIndex()) {
  setIndexFactoryForTest(() => index);
  // jsdom has no media playback.
  window.HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
  pair(platform.storage);
  return renderMobile({ platform, modules: [module], route });
}

export const scanned = (platform: FakePlatform, text: string) =>
  platform.fake.calls.filter((c) => c.method === 'GET' && c.path.startsWith('/api/v1/books?') && c.path.includes(`q=${text}`));
