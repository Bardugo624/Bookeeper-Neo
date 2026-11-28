import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ME, ok } from '../../session/fixtures';
import { setLibraryForTest } from '../reader/opfsLibrary';
import { resetOfflineForTest } from '../reader/offlineStore';
import { fakeLibrary } from '../reader/opfsTestkit';
import { book, renderSearch } from './testkit';

function open(over: Parameters<typeof book>[1], role = 'owner') {
  return renderSearch({
    api: {
      books: [book(1, { id: 'b1', title: 'Dune', ...over })],
      override: (call) => (call.path === '/api/v1/me' ? ok({ ...ME, user: { ...ME.user, role } }) : undefined),
    },
    route: '/books/b1',
  });
}

describe('«Leggi» on the book page', () => {
  it('read_shows_only_for_who_can_read_files', async () => {
    const { unmount } = open({ file_formats: ['epub'] });
    expect(await screen.findByRole('link', { name: 'Leggi' })).toBeTruthy();
    unmount();

    const guest = open({ file_formats: ['epub'] }, 'guest');
    await screen.findByRole('heading', { level: 2, name: 'Dune' });
    expect(screen.queryByRole('link', { name: /^Leggi/ })).toBeNull();
    guest.unmount();

    open({ file_formats: [] });
    await screen.findByRole('heading', { level: 2, name: 'Dune' });
    expect(screen.queryByRole('link', { name: /^Leggi/ })).toBeNull();
  });

  it('read_sits_right_under_the_title', async () => {
    open({ file_formats: ['epub'], authors: ['Frank Herbert'] });
    const link = await screen.findByRole('link', { name: 'Leggi' });
    const title = screen.getByRole('heading', { level: 2, name: 'Dune' });
    const hero = title.parentElement!;
    expect(hero.nextElementSibling).toBe(link);
  });

  it('read_says_the_percent', async () => {
    open({ file_formats: ['epub'], reading: { status: 'reading', progress_percent: 4, current_page: null } });
    expect(await screen.findByRole('link', { name: 'Leggi · 4%' })).toBeTruthy();
  });

  it('opens the reader on the book', async () => {
    open({ file_formats: ['epub'] });
    await userEvent.click(await screen.findByRole('link', { name: 'Leggi' }));
    expect((await screen.findByTestId('reader-probe')).textContent).toBe('reader b1');
  });

  describe('the size of the file', () => {
    beforeEach(() => {
      resetOfflineForTest();
      setLibraryForTest(fakeLibrary().library);
    });
    afterEach(() => setLibraryForTest(null));

    it('a_saved_book_shows_its_size_once', async () => {
      const file = { id: 'f1', book_id: 'b1', format: 'epub', size_bytes: 2_500_000, name: 'dune.epub', sha256: 'sha-f1', created_at: 1, uploaded_by: null, missing: false };
      renderSearch({
        api: {
          books: [book(1, { id: 'b1', file_formats: ['epub'] })],
          override: (call) => {
            const path = call.path.replace('/api/v1', '');
            if (path === '/me') return ok(ME);
            if (path === '/books/b1/files' && call.method === 'GET') return ok([file]);
            return undefined;
          },
        },
        rawHandler: async () => ({ status: 200, bytes: new Uint8Array(2000), contentType: 'application/epub+zip', headers: {} }),
        route: '/books/b1',
      });
      const read = await screen.findByRole('link', { name: 'Leggi' });
      await userEvent.click(await screen.findByRole('button', { name: 'Scarica per leggere offline' }));
      await screen.findByRole('button', { name: 'Togli dal telefono' });
      const block = read.nextElementSibling!;
      expect(block.textContent).toMatch(/Sul telefono · /);
      expect(block.textContent?.match(/\d[\d.,]*\s?(kB|MB|B)/g)).toHaveLength(1);
      expect(block.querySelector('p')!.textContent).toBe('EPUB');
    });
  });
});
