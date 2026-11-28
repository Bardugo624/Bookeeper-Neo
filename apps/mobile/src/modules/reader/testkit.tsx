import { createElement } from 'react';
import type { MobileModule } from '../../app/types';
import { renderMobile } from '../../app/testing';
import { fakePlatform, type FakePlatform, type RecordedCall } from '../../platform/testing';
import { ME, ok, pair } from '../../session/fixtures';
import { memoryQueue } from '@bookeeper/reader/data';
import { module } from './routes';
import { setQueueForTest } from './queue';

import { reader } from './stubReader';
export { reader };

export const file = (id: string, format: string, over: Record<string, unknown> = {}) => ({
  id,
  book_id: 'b1',
  format,
  size_bytes: 1000,
  name: `libro.${format}`,
  sha256: `sha-${id}`,
  created_at: 10,
  uploaded_by: null,
  missing: false,
  ...over,
});

/** A page of the app that has the tab bar, to compare the reader with. */
const detail: MobileModule = {
  id: 'detail',
  routes: [{ path: '/books/:id', element: createElement('p', null, 'Scheda del libro') }],
  tab: { labelKey: 'msearch.tab', icon: 'search', to: '/books', order: 1 },
};

export interface Setup {
  role?: string;
  files?: unknown[];
  route?: string;
  /** The answer to the file list, when it should not be `files`. */
  listing?: { status: number; body: unknown };
}

export function renderReader({ role = 'owner', files = [file('f1', 'epub')], route = '/read/b1', listing }: Setup = {}) {
  reader.props.length = 0;
  setQueueForTest(memoryQueue());
  const handler = (call: RecordedCall) => {
    if (call.path === '/api/v1/me') return ok({ ...ME, user: { ...ME.user, role } });
    if (call.path === '/api/v1/books/b1') return ok({ id: 'b1', title: 'Dune', authors: ['Frank Herbert'], created_at: 1, updated_at: 1 });
    if (call.path === '/api/v1/books/b1/files') return listing ?? ok(files);
    return { status: 404, body: { error_code: 'not_found', message: 'x' } };
  };
  const platform: FakePlatform = fakePlatform({ handler });
  pair(platform.storage);
  return renderMobile({ platform, modules: [detail, module], route });
}
