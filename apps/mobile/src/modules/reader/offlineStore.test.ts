import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Transport } from '@bookeeper/api';
import { cancelOffline, downloadOffline, offlineState, resetOfflineForTest } from './offlineStore';
import { setLibraryForTest } from './opfsLibrary';
import { fakeLibrary } from './opfsTestkit';

const MB = 1024 * 1024;
const meta = { sha256: 'big', format: 'pdf', name: 'big.pdf', bookId: 'b1', fileId: 'f1', sizeBytes: 2.5 * MB };

/** A server that honours `Range`. */
function server(): { transport: Transport; ranges: string[] } {
  const ranges: string[] = [];
  const transport = {
    async request() {
      return { status: 200, body: null };
    },
    async requestRaw(req: { headers?: Record<string, string> }) {
      const range = req.headers?.range ?? '';
      ranges.push(range);
      const [from, to] = range.replace('bytes=', '').split('-').map(Number) as [number, number];
      const end = Math.min(to, meta.sizeBytes - 1);
      return { status: 206, bytes: new Uint8Array(end - from + 1), contentType: null, headers: {} };
    },
  } as Transport;
  return { transport, ranges };
}

let lib = fakeLibrary();
beforeEach(() => {
  lib = fakeLibrary();
  setLibraryForTest(lib.library);
});
afterEach(() => {
  resetOfflineForTest();
  setLibraryForTest(null);
});

describe('the download', () => {
  it('arrives_piece_by_piece_and_is_kept', async () => {
    const { transport, ranges } = server();
    await downloadOffline(meta, transport);
    expect(ranges).toEqual([`bytes=0-${MB - 1}`, `bytes=${MB}-${2 * MB - 1}`, `bytes=${2 * MB}-${3 * MB - 1}`]);
    expect(offlineState('big')).toMatchObject({ status: 'saved', sizeBytes: 2.5 * MB });
  });

  it('cancel_stops_the_transfer_between_pieces', async () => {
    const { transport, ranges } = server();
    const inner = transport.requestRaw!.bind(transport);
    transport.requestRaw = async (req) => {
      const res = await inner(req);
      cancelOffline('big');
      return res;
    };
    await downloadOffline(meta, transport);
    expect(ranges).toHaveLength(1);
    expect(offlineState('big')).toMatchObject({ status: 'none', failed: false });
    expect(lib.files.size).toBe(0);
  });
});
