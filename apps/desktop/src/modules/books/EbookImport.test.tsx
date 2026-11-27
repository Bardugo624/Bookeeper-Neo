import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EbookFileInfo } from './bookFiles';
import { book, installIntersectionObserver, renderBooks, type Library } from './testkit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:cover', revokeObjectURL: () => {} }));
});
afterEach(() => vi.unstubAllGlobals());

const info = (name: string, title: string, authors: string[], over: Partial<EbookFileInfo> = {}): EbookFileInfo => ({
  sha256: `sha-${name}`,
  format: 'epub',
  size_bytes: 10,
  name,
  has_cover: true,
  metadata: { title, authors },
  ...over,
});

const FILES: Record<string, EbookFileInfo> = {
  'rosa.epub': info('rosa.epub', 'Il nome della rosa', ['Umberto Eco']),
  'pendolo.epub': info('pendolo.epub', 'Il pendolo di Foucault', ['Umberto Eco']),
  'isbn.epub': info('isbn.epub', 'Altro titolo', ['Altro'], { metadata: { title: 'Altro titolo', authors: ['Altro'], isbn_13: '9788845292613' } }),
};

function setup(role: Library['role'] = 'owner', books = [book(1, { title: 'Libro 1' })]) {
  const created: unknown[] = [];
  const attached: Array<{ path: string; body: unknown }> = [];
  const lib: Library = {
    books,
    role,
    rawHandler: (r) => {
      if (r.method === 'GET') return { status: 200, body: 'cover' };
      const name = new URL(r.path, 'http://x').searchParams.get('name') ?? '';
      if (name === 'drm.epub') return { status: 422, body: { error_code: 'drm_protected', message: 'x' } };
      return { status: 200, body: FILES[name] };
    },
    extra: (r) => {
      if (r.method === 'POST' && r.path === '/api/v1/books') {
        created.push(r.body);
        return { status: 201, body: book(100 + created.length, { ...(r.body as object), format: 'ebook' }) };
      }
      if (r.method === 'POST' && /^\/api\/v1\/books\/[^/]+\/files$/.test(r.path)) {
        attached.push({ path: r.path, body: r.body });
        return { status: 201, body: { id: 'f', book_id: 'x', format: 'epub', size_bytes: 1, name: 'n', created_at: 0, missing: false } };
      }
      return undefined;
    },
  };
  return { ...renderBooks(lib), created, attached };
}

const epub = (name: string) => new File(['x'], name, { type: 'application/epub+zip' });

async function drop(...names: string[]) {
  const target = await screen.findByText('Libro 1');
  fireEvent.drop(target, { dataTransfer: { files: names.map(epub), types: ['Files'] } });
  return screen.findByRole('dialog', { name: 'Aggiungi e-book' });
}

describe('e-book import', () => {
  it('turns two dropped e-books into two books with their files', async () => {
    const { created, attached } = setup();
    const dialog = await drop('rosa.epub', 'pendolo.epub');
    await waitFor(() => expect(within(dialog).getAllByLabelText('Titolo')).toHaveLength(2));
    const titles = within(dialog).getAllByLabelText('Titolo') as HTMLInputElement[];
    expect(titles.map((t) => t.value)).toEqual(['Il nome della rosa', 'Il pendolo di Foucault']);
    expect((within(dialog).getAllByLabelText('Autori') as HTMLInputElement[])[0]!.value).toBe('Umberto Eco');
    await waitFor(() => expect(dialog.querySelectorAll('img')).toHaveLength(2));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aggiungi 2 libri' }));
    expect(await within(dialog).findByText('2 libri aggiunti.')).toBeInTheDocument();
    expect(created).toMatchObject([
      { title: 'Il nome della rosa', authors: ['Umberto Eco'], format: 'ebook' },
      { title: 'Il pendolo di Foucault', format: 'ebook' },
    ]);
    expect(attached).toEqual([
      { path: '/api/v1/books/b101/files', body: { sha256: 'sha-rosa.epub', name: 'rosa.epub' } },
      { path: '/api/v1/books/b102/files', body: { sha256: 'sha-pendolo.epub', name: 'pendolo.epub' } },
    ]);
  });

  it('keeps a DRM-protected file in error on its row while the others are added', async () => {
    const { created } = setup();
    const dialog = await drop('drm.epub', 'rosa.epub');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/DRM|protett/i);
    await waitFor(() => expect(within(dialog).getAllByLabelText('Titolo')).toHaveLength(1));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aggiungi 1 libro' }));
    expect(await within(dialog).findByText('1 libro aggiunto.')).toBeInTheDocument();
    expect(created).toHaveLength(1);
  });

  it('offers to attach to a book with the same title and authors, and attaches without creating', async () => {
    const same = book(7, { title: 'Il nome della rosa', authors: ['Umberto Eco'] });
    const { created, attached } = setup('owner', [book(1, { title: 'Libro 1' }), same]);
    const dialog = await drop('rosa.epub');
    const box = await within(dialog).findByRole('checkbox', { name: /Attacca a quel libro/ });
    expect(box).toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aggiungi 1 libro' }));
    expect(await within(dialog).findByText('1 file attaccato a un libro già presente.')).toBeInTheDocument();
    expect(created).toHaveLength(0);
    expect(attached).toEqual([{ path: '/api/v1/books/b7/files', body: { sha256: 'sha-rosa.epub', name: 'rosa.epub' } }]);
  });

  it('recognises a book by its ISBN', async () => {
    setup('owner', [book(1, { title: 'Libro 1' }), book(8, { title: 'Titolo diverso', isbn_13: '9788845292613' })]);
    const dialog = await drop('isbn.epub');
    expect(await within(dialog).findByRole('checkbox', { name: /Attacca a quel libro/ })).toBeChecked();
  });

  it('creates a new book when the person unticks the attach choice', async () => {
    const same = book(7, { title: 'Il nome della rosa', authors: ['Umberto Eco'] });
    const { created } = setup('owner', [book(1, { title: 'Libro 1' }), same]);
    const dialog = await drop('rosa.epub');
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /Attacca a quel libro/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aggiungi 1 libro' }));
    expect(await within(dialog).findByText('1 libro aggiunto.')).toBeInTheDocument();
    expect(created).toHaveLength(1);
  });

  it('does not take drops from someone who cannot add books', async () => {
    setup('guest');
    const target = await screen.findByText('Libro 1');
    fireEvent.drop(target, { dataTransfer: { files: [epub('rosa.epub')], types: ['Files'] } });
    expect(screen.queryByRole('dialog', { name: 'Aggiungi e-book' })).toBeNull();
  });
});
