import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BookFile } from './bookFileApi';
import { book, installIntersectionObserver, renderBooksWithReader, type Library } from './testkit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});

const file = (id: string, format: string, created_at = 0): BookFile => ({
  id,
  book_id: 'b1',
  format,
  size_bytes: 1000,
  name: `rosa.${format}`,
  created_at,
  sha256: id.repeat(64).slice(0, 64),
  missing: false,
});

function setup(opts: { files: BookFile[]; role?: Library['role']; percent?: number | null }) {
  const formats = opts.files.map((f) => f.format);
  const reading = opts.percent == null ? null : { status: 'reading', progress_percent: opts.percent, current_page: null };
  const lib: Library = {
    books: [book(1, { title: 'Il nome della rosa', file_formats: formats, reading })],
    role: opts.role ?? 'owner',
    extra: (r) => {
      if (r.path === '/api/v1/books/b1/files' && r.method === 'GET') return { status: 200, body: opts.files };
      if (r.path === '/api/v1/books/b1/reading' && r.method === 'GET') {
        return {
          status: 200,
          body: reading ? { book_id: 'b1', status: 'reading', started_at: 1, finished_at: null, rating: null, note: null, current_page: null, updated_at: 1, progress_percent: opts.percent, progress_at: 1 } : null,
        };
      }
      return undefined;
    },
  };
  return renderBooksWithReader(lib, '/books/b1');
}

describe('«Leggi» on the book page', () => {
  it('read_shows_only_with_a_file_and_a_role', async () => {
    const { unmount } = setup({ files: [file('f1', 'epub')] });
    expect(await screen.findByRole('button', { name: 'Leggi' })).toBeTruthy();
    unmount();

    setup({ files: [], role: 'owner' });
    await screen.findByRole('heading', { level: 1, name: 'Il nome della rosa' });
    expect(screen.queryByRole('button', { name: /^Leggi/ })).toBeNull();
  });

  it('read_shows_only_with_a_file_and_a_role (guest)', async () => {
    setup({ files: [file('f1', 'epub')], role: 'guest' });
    await screen.findByRole('heading', { level: 1, name: 'Il nome della rosa' });
    expect(screen.queryByRole('button', { name: /^Leggi/ })).toBeNull();
  });

  it('read_says_the_percent', async () => {
    setup({ files: [file('f1', 'epub')], percent: 4 });
    expect(await screen.findByRole('button', { name: 'Leggi · 4%' })).toBeTruthy();
  });

  it('opens the reader on the main file', async () => {
    setup({ files: [file('f2', 'pdf'), file('f1', 'epub')] });
    await userEvent.click(await screen.findByRole('button', { name: 'Leggi' }));
    expect((await screen.findByTestId('reader-probe')).textContent).toBe('reader b1?file=f1');
  });

  it('other_files_open_from_the_menu', async () => {
    setup({ files: [file('f1', 'epub'), file('f2', 'pdf')] });
    await userEvent.click(await screen.findByRole('button', { name: 'Altri file da leggere' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Apri il PDF' }));
    expect((await screen.findByTestId('reader-probe')).textContent).toBe('reader b1?file=f2');
  });

  it('has no menu with a single file', async () => {
    setup({ files: [file('f1', 'epub')] });
    await screen.findByRole('button', { name: 'Leggi' });
    expect(screen.queryByRole('button', { name: 'Altri file da leggere' })).toBeNull();
  });

  it('the_reading_card_offers_continue', async () => {
    setup({ files: [file('f1', 'epub')], percent: 45 });
    const card = await screen.findByRole('region', { name: 'Lettura' });
    const go = await (await import('@testing-library/react')).within(card).findByRole('button', { name: 'Continua · 45%' });
    await userEvent.click(go);
    expect((await screen.findByTestId('reader-probe')).textContent).toMatch(/^reader b1/);
  });
});
