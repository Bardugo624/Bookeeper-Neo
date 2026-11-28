import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@bookeeper/api';
import { ReaderApp } from '@bookeeper/reader/app';
import { memoryQueue } from '@bookeeper/reader/data';
import { fakeNetwork, fakeTransport } from '../../platform/testing';
import { createMobileBackend } from './mobileBackend';
import { setLibraryForTest, streamOf } from './opfsLibrary';
import { fakeLibrary } from './opfsTestkit';

const h = vi.hoisted(() => {
  const engines: { open: ReturnType<typeof vi.fn> }[] = [];
  class FakeEngine {
    open = vi.fn(async () => ({ type: 'opened', toc: [], sectionFractions: [0], sectionChars: [1000], format: 'epub', title: null }));
    setLayout = vi.fn();
    next = vi.fn();
    prev = vi.fn();
    goTo = vi.fn();
    setMarks = vi.fn();
    search = vi.fn(async () => {});
    stopSearch = vi.fn();
    clearSelection = vi.fn();
    close = vi.fn(async () => {});
    ready = vi.fn(async () => {});
    on() {
      return () => {};
    }
    constructor() {
      engines.push(this);
    }
  }
  return { engines, FakeEngine };
});
vi.mock('@bookeeper/reader/engine', () => ({ Engine: h.FakeEngine }));

const FILE = { id: 'f1', sha256: 'sha1', format: 'epub', name: 'dune.epub' };
const bytes = new Uint8Array([7, 7, 7]);

function mount(over: { net?: ReturnType<typeof fakeNetwork>; raw?: () => { status: number } } = {}) {
  const net = over.net ?? fakeNetwork(true);
  const transport = fakeTransport(
    () => ({ status: 200, body: [] }),
    () => ({ status: 200, bytes: new Uint8Array([1]), contentType: 'application/epub+zip', headers: {} }),
  );
  const queue = memoryQueue();
  const backend = createMobileBackend({
    client: createClient(transport),
    transport,
    bookId: 'b1',
    fileId: 'f1',
    deviceId: 'd1',
    queue,
    file: { sha256: FILE.sha256, format: FILE.format },
    offline: { read: (sha) => library.library.open(sha) },
    online: () => net.online(),
  });
  render(<ReaderApp backend={backend} book={{ id: 'b1', title: 'Dune', authors: [] }} file={FILE} platform="phone" locale="it" appDark={false} onClose={() => {}} />);
  return { transport, queue, net };
}

let library = fakeLibrary();
beforeEach(() => {
  h.engines.length = 0;
  library = fakeLibrary();
  setLibraryForTest(library.library);
});
afterEach(() => setLibraryForTest(null));

describe('the reader without a network', () => {
  it('the_offline_copy_opens_first', async () => {
    await library.library.save({ sha256: 'sha1', format: 'epub', name: 'dune.epub', bookId: 'b1', fileId: 'f1', sizeBytes: 3 }, streamOf(bytes), () => {}, new AbortController().signal);
    const { transport } = mount({ net: fakeNetwork(false) });
    await waitFor(() => expect(h.engines[0]?.open).toHaveBeenCalled());
    const blob = (h.engines[0]!.open.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.size).toBe(3);
    expect(transport.rawCalls).toEqual([]);
  });

  it('offline_without_a_copy_says_so', async () => {
    const { transport } = mount({ net: fakeNetwork(false) });
    expect(await screen.findByText('Sei offline e questo libro non è sul telefono')).toBeInTheDocument();
    expect(transport.rawCalls).toEqual([]);
    expect(h.engines[0]?.open).not.toHaveBeenCalled();
  });

  it('the_queue_drains_when_the_network_comes_back', async () => {
    const net = fakeNetwork(false);
    await library.library.save({ sha256: 'sha1', format: 'epub', name: 'dune.epub', bookId: 'b1', fileId: 'f1', sizeBytes: 3 }, streamOf(bytes), () => {}, new AbortController().signal);
    const { transport, queue } = mount({ net });
    await queue.push({ type: 'position', fileId: 'f1', body: { kind: 'cfi', value: 'epubcfi(/6/2)', percent: 12 }, at: 5 });
    // Still no network: the write fails and stays in the queue.
    transport.request = vi.fn(async () => {
      throw new TypeError('network down');
    });
    await act(async () => void window.dispatchEvent(new Event('online')));
    expect(await queue.list()).toHaveLength(1);
    const sent: string[] = [];
    transport.request = vi.fn(async (method: string, path: string) => {
      sent.push(`${method} ${path}`);
      return { status: 200, body: {} };
    }) as typeof transport.request;
    await act(async () => void window.dispatchEvent(new Event('online')));
    await waitFor(async () => expect(await queue.list()).toEqual([]));
    expect(sent.some((s) => s.startsWith('PUT') && s.includes('/files/f1/position'))).toBe(true);
  });
});
