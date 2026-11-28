import { screen } from '@testing-library/react';
import { ApiError } from '@bookeeper/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMobile } from '../../app/testing';
import { fakePlatform } from '../../platform/testing';
import { pair } from '../../session/fixtures';
import { memoryQueue } from '@bookeeper/reader/data';
import { module } from './routes';
import { setQueueForTest } from './queue';
import { setLibraryForTest, streamOf } from './opfsLibrary';
import { fakeLibrary } from './opfsTestkit';

vi.mock('@bookeeper/reader/app', async () => ({ ReaderApp: (await import('./stubReader')).StubReaderApp }));

const down = () => {
  throw new ApiError(0, 'network', 'offline');
};

function open(online = false) {
  setQueueForTest(memoryQueue());
  const platform = fakePlatform({ handler: down, online });
  pair(platform.storage);
  return renderMobile({ platform, modules: [module], route: '/read/b1' });
}

let lib = fakeLibrary();
beforeEach(() => {
  lib = fakeLibrary();
  setLibraryForTest(lib.library);
});
afterEach(() => setLibraryForTest(null));

describe('a cold start without a network', () => {
  it('a_kept_copy_opens_with_no_session_and_no_listing', async () => {
    await lib.library.save({ sha256: 'sha1', format: 'epub', name: 'dune.epub', bookId: 'b1', sizeBytes: 3 }, streamOf(new Uint8Array([1, 2, 3])), () => {}, new AbortController().signal);
    open();
    expect(await screen.findByTestId('reader')).toHaveAttribute('data-platform', 'phone');
  });

  it('without_a_copy_the_route_says_the_book_is_not_on_the_phone', async () => {
    open();
    expect(await screen.findByText(/non è sul telefono|Sei offline/)).toBeInTheDocument();
  });
});
