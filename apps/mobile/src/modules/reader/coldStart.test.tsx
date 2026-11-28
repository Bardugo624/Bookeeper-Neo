import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@bookeeper/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMobile } from '../../app/testing';
import { fakePlatform } from '../../platform/testing';
import { ME, ok, pair } from '../../session/fixtures';
import { memoryQueue } from '@bookeeper/reader/data';
import { module } from './routes';
import { setQueueForTest } from './queue';
import { setLibraryForTest, streamOf } from './opfsLibrary';
import { fakeLibrary } from './opfsTestkit';
import { reader } from './stubReader';
import { file } from './testkit';

vi.mock('@bookeeper/reader/app', async () => ({ ReaderApp: (await import('./stubReader')).StubReaderApp }));

const down = () => {
  throw new ApiError(0, 'network', 'offline');
};

function open(online = false) {
  setQueueForTest(memoryQueue());
  const platform = fakePlatform({ handler: down, online });
  pair(platform.storage);
  renderMobile({ platform, modules: [module], route: '/read/b1' });
  return platform;
}

let lib = fakeLibrary();
beforeEach(() => {
  lib = fakeLibrary();
  setLibraryForTest(lib.library);
});
afterEach(() => setLibraryForTest(null));

describe('a cold start without a network', () => {
  it('a_kept_copy_opens_with_no_session_and_no_listing', async () => {
    await lib.library.save({ sha256: 'sha1', format: 'epub', name: 'dune.epub', bookId: 'b1', fileId: 'f1', sizeBytes: 3 }, streamOf(new Uint8Array([1, 2, 3])), () => {}, new AbortController().signal);
    open();
    expect(await screen.findByTestId('reader')).toHaveAttribute('data-platform', 'phone');
  });

  it('the_kept_copy_opens_with_its_real_file_id_so_the_position_resumes_and_syncs', async () => {
    await lib.library.save({ sha256: 'sha1', format: 'epub', name: 'dune.epub', bookId: 'b1', fileId: 'f1', sizeBytes: 3 }, streamOf(new Uint8Array([1, 2, 3])), () => {}, new AbortController().signal);
    reader.props.length = 0;
    const platform = open();
    // The position key and the queued writes are both keyed by `file.id`.
    expect(await screen.findByTestId('reader')).toHaveAttribute('data-file', 'f1');
    const { backend, file } = reader.props.at(-1)!;
    expect(file.id).toBe('f1');
    await backend.putPosition({ kind: 'cfi', value: 'epubcfi(/6/2)', percent: 60 }).catch(() => undefined);
    expect(platform.fake.calls.map((c) => c.path)).toContain('/api/v1/books/b1/files/f1/position');
  });

  it('without_a_copy_the_route_says_the_book_is_not_on_the_phone', async () => {
    open();
    expect(await screen.findByText('Sei offline e questo libro non è sul telefono.')).toBeInTheDocument();
    expect(screen.queryByTestId('reader')).not.toBeInTheDocument();
  });

  it('retry_reloads_the_session_when_the_network_is_back', async () => {
    let server = false;
    const handler = (call: { path: string }) => {
      if (!server) return down();
      if (call.path === '/api/v1/me') return ok(ME);
      if (call.path === '/api/v1/books/b1') return ok({ id: 'b1', title: 'Dune', authors: [], created_at: 1, updated_at: 1 });
      if (call.path === '/api/v1/books/b1/files') return ok([file('f1', 'epub')]);
      return { status: 404, body: { error_code: 'not_found', message: 'x' } };
    };
    setQueueForTest(memoryQueue());
    const platform = fakePlatform({ handler, online: false });
    pair(platform.storage);
    const view = renderMobile({ platform, modules: [module], route: '/read/b1' });
    const meCalls = () => platform.fake.calls.filter((c) => c.path === '/api/v1/me').length;
    await userEvent.click(await screen.findByRole('button', { name: /riprova/i }));
    const afterRetry = meCalls();
    expect(afterRetry).toBeGreaterThan(0);
    // The server answers again and the network returns: the session is read and the reader opens, no detour to the book.
    server = true;
    act(() => platform.network.set(true));
    expect(await screen.findByTestId('reader')).toHaveAttribute('data-file', 'f1');
    expect(meCalls()).toBeGreaterThan(afterRetry);
    expect(view.router.state.location.pathname).toBe('/read/b1');
  });

  it('the_kept_copy_stays_open_when_the_network_returns', async () => {
    await lib.library.save({ sha256: 'sha1', format: 'epub', name: 'dune.epub', bookId: 'b1', fileId: 'f1', sizeBytes: 3 }, streamOf(new Uint8Array([1, 2, 3])), () => {}, new AbortController().signal);
    let server = false;
    const handler = (call: { path: string }) => {
      if (!server) return down();
      if (call.path === '/api/v1/me') return ok(ME);
      if (call.path === '/api/v1/books/b1') return ok({ id: 'b1', title: 'Dune', authors: [], created_at: 1, updated_at: 1 });
      if (call.path === '/api/v1/books/b1/files') return ok([file('f2', 'epub')]);
      return { status: 404, body: { error_code: 'not_found', message: 'x' } };
    };
    setQueueForTest(memoryQueue());
    const platform = fakePlatform({ handler, online: false });
    pair(platform.storage);
    renderMobile({ platform, modules: [module], route: '/read/b1' });
    const open = await screen.findByTestId('reader');
    expect(open).toHaveAttribute('data-file', 'f1');
    server = true;
    act(() => platform.network.set(true));
    await new Promise((r) => setTimeout(r, 100));
    // The same reader, on the same file: nothing closed or reopened under the person.
    expect(screen.getByTestId('reader')).toBe(open);
    expect(open).toHaveAttribute('data-file', 'f1');
  });
});
