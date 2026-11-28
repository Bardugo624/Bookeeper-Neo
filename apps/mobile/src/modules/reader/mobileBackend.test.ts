import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createClient, type RawResponse } from '@bookeeper/api';
import { memoryQueue } from '@bookeeper/reader/data';
import { fakeTransport } from '../../platform/testing';
import { createMobileBackend } from './mobileBackend';

afterEach(() => vi.restoreAllMocks());

const readText = (blob: Blob) =>
  new Promise<string>((ok) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.readAsText(blob);
  });

function backend(raw: (path: string) => RawResponse = () => ({ status: 200, bytes: new Uint8Array([1, 2, 3]), contentType: 'application/epub+zip', headers: {} })) {
  const transport = fakeTransport(
    () => ({ status: 200, body: null }),
    (req) => raw(req.path),
  );
  return {
    transport,
    backend: createMobileBackend({
      client: createClient(transport),
      transport,
      bookId: 'b1',
      fileId: 'f1',
      deviceId: 'd1',
      queue: memoryQueue(),
    }),
  };
}

describe('the phone backend', () => {
  it('export_shares_or_downloads', async () => {
    const { backend: b } = backend();
    const share = vi.fn(async () => undefined);
    Object.assign(navigator, { canShare: () => true, share });
    await b.saveText('Autore - Titolo - note.md', '# Titolo');
    expect(share).toHaveBeenCalledTimes(1);
    const sent = (share.mock.calls[0] as unknown as [{ files: File[] }])[0].files[0]!;
    expect(sent.name).toBe('Autore - Titolo - note.md');
    expect(await readText(sent)).toBe('# Titolo');

    // No sharing of files: a download.
    Object.assign(navigator, { canShare: undefined, share: undefined });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await b.saveText('note.md', 'ciao');
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('a_cancelled_share_is_not_an_error', async () => {
    const { backend: b } = backend();
    Object.assign(navigator, {
      canShare: () => true,
      share: vi.fn(async () => {
        throw new DOMException('cancelled', 'AbortError');
      }),
    });
    await expect(b.saveText('n.md', 'x')).resolves.toBeUndefined();
  });

  it('loads_the_file_with_the_session_transport_and_reports_progress', async () => {
    const { backend: b, transport } = backend();
    const seen: number[] = [];
    const blob = await b.loadFile(new AbortController().signal, (f) => seen.push(f));
    expect(transport.rawCalls[0]?.path).toBe('/api/v1/books/b1/files/f1/content');
    expect(blob.size).toBe(3);
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('a_missing_file_is_a_404', async () => {
    const { backend: b } = backend(() => ({ status: 404, bytes: new TextEncoder().encode('{"error_code":"not_found","message":"x"}'), contentType: null, headers: {} }));
    await expect(b.loadFile(new AbortController().signal, () => {})).rejects.toMatchObject({ status: 404 });
    await expect(b.loadFile(new AbortController().signal, () => {})).rejects.toBeInstanceOf(ApiError);
  });

  it('the_offline_copy_wins_over_the_network', async () => {
    const transport = fakeTransport();
    const b = createMobileBackend({
      client: createClient(transport),
      transport,
      bookId: 'b1',
      fileId: 'f1',
      deviceId: 'd1',
      queue: memoryQueue(),
      offline: { read: async () => new Blob(['x']) },
      file: { sha256: 's', format: 'epub' },
    });
    expect((await b.loadFile(new AbortController().signal, () => {})).size).toBe(1);
    expect(transport.rawCalls).toHaveLength(0);
  });

  it('opens_links_without_an_opener', () => {
    const { backend: b } = backend();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    b.openExternal('https://duckduckgo.com/?q=x');
    expect(open).toHaveBeenCalledWith('https://duckduckgo.com/?q=x', '_blank', 'noopener');
  });
});
