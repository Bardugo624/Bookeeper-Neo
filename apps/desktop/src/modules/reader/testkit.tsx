import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { renderApp } from '../../app/testing';
import type { AppModule } from '../../app/types';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../platform/testing';
import { ME, ok } from '../../session/fixtures';
import type { BookFile } from '../books/bookFileApi';
import { module } from './routes';

export const SHA = 'ab'.repeat(32);

export const file = (id: string, format: string, created_at = 1, over: Partial<BookFile> = {}): BookFile => ({
  id,
  book_id: 'b1',
  format,
  size_bytes: 10,
  name: `libro.${format}`,
  created_at,
  sha256: SHA,
  missing: false,
  ...over,
});

export interface ReaderProps {
  backend: import('@bookeeper/reader/data').ReaderBackend;
  book: { id: string; title: string; authors: string[] };
  file: { id: string; sha256: string; format: string; name: string };
  platform: 'desktop' | 'phone';
  locale: string;
  appDark: boolean;
  topEnd?: ReactNode;
  onClose: () => void;
}

/** What the mocked `ReaderApp` was last given. */
export const shown: { props: ReaderProps | null } = { props: null };

export function recordReader(props: ReaderProps): ReactNode {
  shown.props = props;
  return (
    <div data-testid="reader">
      {props.book.title}
      {props.topEnd}
      <button onClick={props.onClose}>chiudi lettore</button>
    </div>
  );
}

export interface Setup {
  files?: BookFile[];
  role?: 'owner' | 'guest';
  route?: string;
}

/** A desktop platform whose library holds book `b1` ("Il nome della rosa") and `files`. */
export function setup({ files = [file('f1', 'epub')], role = 'owner', route = '/read/b1' }: Setup = {}) {
  const platform: FakePlatform = fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: (r) => {
      if (r.path === '/api/v1/me') return ok({ ...ME, user: { ...ME.user, role } });
      if (r.path === '/api/v1/books/b1') return ok({ id: 'b1', title: 'Il nome della rosa', authors: ['Umberto Eco'] });
      if (r.path === '/api/v1/books/b1/files') return ok(files);
      return { status: 404, body: { error_code: 'not_found', message: 'x' } };
    },
  });
  const book: AppModule = {
    id: 'books',
    nav: { labelKey: 'books.title', icon: 'book', to: '/books', group: 'main', order: 10 },
    routes: [{ path: '/books/:id', element: <h1>Scheda del libro</h1> }],
  };
  const view = renderApp({ platform, modules: [book, module], route });
  return { ...view, platform, fetchSpy: vi.fn() };
}
