import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, ok } from '../../session/fixtures';
import { setLibraryForTest } from '../reader/opfsLibrary';
import { resetOfflineForTest } from '../reader/offlineStore';
import { fakeLibrary } from '../reader/opfsTestkit';
import { book, renderSearch } from './testkit';

const file = { id: 'f1', book_id: 'b1', format: 'epub', size_bytes: 2_500_000, name: 'dune.epub', sha256: 'sha-f1', created_at: 1, uploaded_by: null, missing: false };

function open(delay?: Promise<void>) {
  return renderSearch({
    api: {
      books: [book(1, { id: 'b1', file_formats: ['epub'] })],
      override: (call) => {
        const path = call.path.replace('/api/v1', '');
        if (path === '/me') return ok(ME);
        if (path === '/books/b1/files' && call.method === 'GET') return ok([file]);
        return undefined;
      },
    },
    rawHandler: async () => {
      await delay;
      return { status: 200, bytes: new Uint8Array(2000), contentType: 'application/epub+zip', headers: {} };
    },
    route: '/books/b1',
  });
}
const block = async () => {
  await screen.findByRole('link', { name: 'Leggi' });
  return within(document.body);
};
const setUa = (ua: string, extra: Partial<Navigator> = {}) => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  for (const [k, v] of Object.entries(extra)) vi.spyOn(navigator, k as 'platform', 'get').mockReturnValue(v as never);
};

let library = fakeLibrary();
beforeEach(() => {
  resetOfflineForTest();
  library = fakeLibrary();
  setLibraryForTest(library.library);
});
afterEach(() => {
  vi.restoreAllMocks();
  setLibraryForTest(null);
});

describe('the book page offers the book offline', () => {
  it('save_open_and_remove_from_the_page', async () => {
    open();
    const b = await block();
    await userEvent.click(await b.findByRole('button', { name: 'Scarica per leggere offline' }));
    expect(await b.findByText(/Sul telefono · 2 kB|Sul telefono · 2,0 kB|Sul telefono · 1,9 kB/)).toBeInTheDocument();
    expect(library.files.has('sha-f1.epub')).toBe(true);
    await userEvent.click(b.getByRole('button', { name: 'Togli dal telefono' }));
    expect(await b.findByRole('button', { name: 'Scarica per leggere offline' })).toBeInTheDocument();
    expect(library.files.size).toBe(0);
  });

  it('a_download_shows_its_progress_and_can_be_cancelled', async () => {
    let release = () => {};
    open(new Promise<void>((r) => (release = r)));
    const b = await block();
    await userEvent.click(await b.findByRole('button', { name: 'Scarica per leggere offline' }));
    expect(await b.findByText('Scarico… 0%')).toBeInTheDocument();
    await userEvent.click(b.getByRole('button', { name: 'Annulla' }));
    release();
    expect(await b.findByRole('button', { name: 'Scarica per leggere offline' })).toBeInTheDocument();
    expect(library.files.size).toBe(0);
    expect(await library.library.list()).toEqual([]);
  });

  it('iphone_in_safari_gets_the_explanation_instead', async () => {
    setUa('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1.15');
    const view = open();
    const b = await block();
    await userEvent.click(await b.findByRole('button', { name: 'Scarica per leggere offline' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(/Per leggere offline, aggiungi Bookeeper alla schermata Home/)).toBeInTheDocument();
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(3);
    // Nothing was downloaded.
    expect(view.platform.fake.rawCalls.filter((c) => c.path.endsWith('/content'))).toEqual([]);
    expect(library.files.size).toBe(0);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Ho capito' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('an_iphone_on_the_home_screen_downloads', async () => {
    setUa('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1.15');
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    open();
    const b = await block();
    await userEvent.click(await b.findByRole('button', { name: 'Scarica per leggere offline' }));
    expect(await b.findByRole('button', { name: 'Togli dal telefono' })).toBeInTheDocument();
    Reflect.deleteProperty(navigator, 'standalone');
  });

  it('offline_control_sits_under_read', async () => {
    open();
    const read = await screen.findByRole('link', { name: 'Leggi' });
    const button = await screen.findByRole('button', { name: 'Scarica per leggere offline' });
    expect(read.nextElementSibling).toContainElement(button);
    expect(read.nextElementSibling).toHaveTextContent('EPUB · 2,4 MB');
    const files = screen.getByRole('region', { name: 'File' });
    expect(within(files).queryByRole('button', { name: 'Scarica per leggere offline' })).toBeNull();
  });

  it('install_steps_show_the_icons_and_the_bold_names', async () => {
    setUa('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1.15');
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Scarica per leggere offline' }));
    const items = within(await screen.findByRole('dialog')).getAllByRole('listitem');
    expect(items[0]!.querySelector('strong')).toHaveTextContent('Condividi');
    expect(items[0]!.querySelector('svg')).not.toBeNull();
    expect(items[1]!.querySelector('strong')).toHaveTextContent('Aggiungi alla schermata Home');
    expect(items[1]!.querySelector('svg')).not.toBeNull();
    expect(items[0]).not.toHaveTextContent('**');
    expect(items[1]).not.toHaveTextContent('{');
  });
});
