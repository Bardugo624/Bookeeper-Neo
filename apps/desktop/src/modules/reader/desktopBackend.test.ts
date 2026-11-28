import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PutAnnotation, PutPosition } from '@bookeeper/api';
import { memoryQueue } from '@bookeeper/reader/data';
import { fakePlatform } from '../../platform/testing';
import { createDesktopBackend } from './desktopBackend';

afterEach(() => vi.unstubAllGlobals());

// jsdom's Blob has no `text()`.
const readText = (b: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(b);
  });

const SHA = 'cd'.repeat(32);

function make(over: { token?: string | null } = {}) {
  const platform = fakePlatform();
  const calls: Array<[string, ...unknown[]]> = [];
  const client = {
    listPositions: async (b: string) => (calls.push(['listPositions', b]), []),
    putPosition: async (b: string, f: string, body: PutPosition) => (calls.push(['putPosition', b, f, body]), null),
    getReading: async (b: string) => (calls.push(['getReading', b]), { rating: 4, note: 'bello', started_at: 5 }),
    setReading: async (b: string, body: unknown) => (calls.push(['setReading', b, body]), {}),
    listAnnotations: async (b: string, since?: number) => (calls.push(['listAnnotations', b, since]), []),
    putAnnotation: async (b: string, id: string, body: PutAnnotation) => (calls.push(['putAnnotation', b, id, body]), { id }),
  };
  const queue = memoryQueue();
  const backend = createDesktopBackend({
    platform,
    client: client as never,
    queue,
    bookId: 'b1',
    file: { id: 'f1', sha256: SHA, format: 'epub' },
    connection: { id: 'c1', deviceId: 'dev-1', token: () => (over.token === undefined ? 'tok' : over.token) },
    saveFilterName: 'Markdown',
  });
  return { platform, calls, backend, queue };
}

describe('the desktop backend', () => {
  it('web_search_opens_duckduckgo', () => {
    const { backend, platform } = make();
    backend.openExternal(`https://duckduckgo.com/?q=${encodeURIComponent('il nome della rosa')}`);
    expect(platform.opened).toEqual(['https://duckduckgo.com/?q=il%20nome%20della%20rosa']);
  });

  it('load_file_reads_the_platform_url', async () => {
    const { backend, platform } = make();
    platform.setReaderFile(() => 'asset://localhost/reader/x.epub');
    const fetchSpy = vi.fn(async () => new Response(new TextEncoder().encode('ciao mondo'), { headers: { 'content-length': '10' } }));
    vi.stubGlobal('fetch', fetchSpy);
    const progress: number[] = [];
    const blob = await backend.loadFile(new AbortController().signal, (f) => progress.push(f));
    expect(platform.readerFiles).toEqual([
      { connectionId: 'c1', bookId: 'b1', fileId: 'f1', sha256: SHA, format: 'epub', headers: { Authorization: 'Bearer tok' } },
    ]);
    expect(fetchSpy).toHaveBeenCalledWith('asset://localhost/reader/x.epub', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(await readText(blob)).toBe('ciao mondo');
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((f) => f >= 0 && f <= 1)).toBe(true);
  });

  it('fails when the file cannot be read', async () => {
    const { backend } = make();
    vi.stubGlobal('fetch', async () => new Response('no', { status: 404 }));
    await expect(backend.loadFile(new AbortController().signal, () => undefined)).rejects.toMatchObject({ status: 404 });
  });

  it('passes the device and the queue on', () => {
    const { backend, queue } = make();
    expect(backend.deviceId).toBe('dev-1');
    expect(backend.queue).toBe(queue);
  });

  it('binds positions and notes to the book and the file', async () => {
    const { backend, calls } = make();
    const pos = { value: 'cfi', percent: 3 } as unknown as PutPosition;
    await backend.listPositions();
    await backend.putPosition(pos);
    await backend.getReading();
    await backend.listAnnotations(7);
    const body = { kind: 'bookmark' } as unknown as PutAnnotation;
    await backend.putAnnotation('n1', body);
    expect(calls).toEqual([
      ['listPositions', 'b1'],
      ['putPosition', 'b1', 'f1', pos],
      ['getReading', 'b1'],
      ['listAnnotations', 'b1', 7],
      ['putAnnotation', 'b1', 'n1', body],
    ]);
  });

  it('marks the book read keeping the rating and the note', async () => {
    const { backend, calls } = make();
    await backend.markRead();
    expect(calls).toContainEqual(['setReading', 'b1', { status: 'read', started_at: 5, rating: 4, note: 'bello' }]);
  });

  it('saves the text as a Markdown file with the save window', async () => {
    const { backend, platform } = make();
    await backend.saveText('Eco - Rosa - note.md', '# Rosa');
    expect(platform.saved).toHaveLength(1);
    const req = platform.saved[0]!;
    expect(req.suggestedName).toBe('Eco - Rosa - note.md');
    expect(new TextDecoder().decode(req.bytes)).toBe('# Rosa');
    expect(req.mime).toBe('text/markdown');
    expect(req.filters).toEqual([{ name: 'Markdown', extensions: ['md'] }]);
  });
});
