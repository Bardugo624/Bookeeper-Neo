import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError, type BookOut } from '@bookeeper/api';
import type { FakePlatform } from '../../platform/testing';
import { ISBN10, ISBN13, book, err, meta, renderScan, scanPlatform, scanned, type Server } from './testkit';

async function start(s: Server = {}) {
  const { platform } = scanPlatform(s);
  const view = renderScan(platform);
  await screen.findByText('Inquadra il codice a barre sul retro del libro');
  return { ...view, platform };
}
const read = (platform: FakePlatform, text = ISBN13) => act(() => platform.scanner.emit({ text, format: 'ean_13' }));
const sheet = () => screen.findByRole('dialog');

describe('already in the library', () => {
  it('shows the book, where it is, and opens its page', async () => {
    const user = userEvent.setup();
    const owned = book({ isbn_13: ISBN13, placement: { shelf_id: 's1', row_index: 1 } as BookOut['placement'] });
    const { platform, router } = await start({ books: [owned] });
    read(platform);
    const dialog = await sheet();
    expect(await within(dialog).findByText('È nella tua libreria')).toBeInTheDocument();
    expect(await within(dialog).findByText('Salotto · ripiano 2 · posto 1')).toBeInTheDocument();
    expect(platform.fake.calls.some((c) => c.path.includes('/lookup/'))).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Apri la scheda' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/books/b1'));
  });

  it('finds it by the other form of the ISBN', async () => {
    const { platform } = await start({ books: [book({ isbn_10: ISBN10 })] });
    read(platform);
    expect(await screen.findByText('È nella tua libreria')).toBeInTheDocument();
    expect(scanned(platform, ISBN13)).toHaveLength(1);
    expect(scanned(platform, ISBN10)).toHaveLength(1);
  });
});

describe('not in the library', () => {
  it('adds the looked-up book, then counts it', async () => {
    const user = userEvent.setup();
    const found = meta({
      subtitle: 'Sub',
      publisher: 'Pub',
      published_year: 1815,
      cover_candidates: ['https://x/c.jpg'],
    });
    const { platform, router } = await start({ lookup: found });
    read(platform);
    const dialog = await sheet();
    expect(await within(dialog).findByText('Jane Austen')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Aggiungi alla libreria' }));
    expect(await within(dialog).findByText('Aggiunto')).toBeInTheDocument();
    const post = platform.fake.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/books');
    expect(post?.body).toEqual({
      title: 'Emma',
      isbn_13: ISBN13,
      isbn_10: ISBN10,
      authors: ['Jane Austen'],
      subtitle: 'Sub',
      publisher: 'Pub',
      published_year: 1815,
    });
    const cover = platform.fake.calls.find((c) => c.path === '/api/v1/books/new/cover/fetch');
    expect(cover?.body).toEqual({ candidates: ['https://x/c.jpg'] });
    await user.click(within(dialog).getByRole('button', { name: 'Apri la scheda' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/books/new'));
  });

  it('counts the books added and goes on scanning', async () => {
    const user = userEvent.setup();
    const { platform } = await start({ lookup: meta() });
    read(platform);
    await user.click(await screen.findByRole('button', { name: 'Aggiungi alla libreria' }));
    await user.click(await screen.findByRole('button', { name: 'Scansiona un altro' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('1 libro aggiunto')).toBeInTheDocument();
    read(platform);
    expect(await sheet()).toBeInTheDocument();
  });

  it('offers no way to add for someone who cannot write', async () => {
    const { platform } = await start({ lookup: meta(), role: 'guest' });
    read(platform);
    expect(await screen.findByText('Jane Austen')).toBeInTheDocument();
    expect(screen.getByText('Non puoi aggiungere libri a questa libreria.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aggiungi/ })).toBeNull();
  });

  it('adds with just the title when nothing is known', async () => {
    const user = userEvent.setup();
    const { platform } = await start();
    read(platform);
    expect(await screen.findByText('Nessun dato trovato')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aggiungi con il solo ISBN e titolo' }));
    expect(await screen.findByText('Scrivi il titolo del libro.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Titolo'), 'Il mio libro');
    await user.click(screen.getByRole('button', { name: 'Aggiungi con il solo ISBN e titolo' }));
    expect(await screen.findByText('Aggiunto')).toBeInTheDocument();
    const post = platform.fake.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/books');
    expect(post?.body).toEqual({ title: 'Il mio libro', isbn_13: ISBN13, isbn_10: ISBN10 });
  });

  it('does not offer to add to a reader when nothing is known', async () => {
    const { platform } = await start({ role: 'guest' });
    read(platform);
    expect(await screen.findByText('Nessun dato trovato')).toBeInTheDocument();
    expect(screen.queryByLabelText('Titolo')).toBeNull();
  });
});

describe('failures', () => {
  it('says when the lookup is rate limited, and tries again on request', async () => {
    const user = userEvent.setup();
    const s: Server = { lookup: err(429, 'rate_limited', { retryAfter: 30 }) };
    const { platform } = await start(s);
    read(platform);
    expect(await screen.findByText('Troppi tentativi. Riprova tra 30 secondi.')).toBeInTheDocument();
    s.lookup = meta();
    await user.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('Jane Austen')).toBeInTheDocument();
  });

  it('says when the server cannot be reached', async () => {
    const { platform } = scanPlatform();
    const inner = platform.fake.request.bind(platform.fake);
    platform.fake.request = async (m, p, b, h) => {
      if (p.startsWith('/api/v1/books?')) throw new ApiError(0, 'network', 'down');
      return inner(m, p, b, h);
    };
    renderScan(platform);
    await screen.findByText('Inquadra il codice a barre sul retro del libro');
    read(platform);
    expect(await screen.findByText(/Impossibile raggiungere il server/)).toBeInTheDocument();
  });

  it('treats a duplicate answered by the core as already in the library', async () => {
    const user = userEvent.setup();
    const books: BookOut[] = [];
    const { platform } = await start({
      books,
      lookup: meta(),
      create: () => {
        books.push(book({ isbn_13: ISBN13 }));
        return err(409, 'duplicate_isbn');
      },
    });
    read(platform);
    await user.click(await screen.findByRole('button', { name: 'Aggiungi alla libreria' }));
    expect(await screen.findByText('È nella tua libreria')).toBeInTheDocument();
    expect(screen.queryByText('1 libro aggiunto')).toBeNull();
  });

  it('keeps the sheet when adding fails, and says so', async () => {
    const user = userEvent.setup();
    const { platform } = await start({ lookup: meta(), create: () => err(500, 'internal') });
    read(platform);
    await user.click(await screen.findByRole('button', { name: 'Aggiungi alla libreria' }));
    expect(await screen.findByText('Qualcosa è andato storto. Riprova.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aggiungi alla libreria' })).toBeEnabled();
  });
});

describe('series of scans', () => {
  it('looks the same code up once while the sheet is open, and reads again once it is closed', async () => {
    const user = userEvent.setup();
    const { platform } = await start({ lookup: meta() });
    for (let i = 0; i < 10; i++) read(platform);
    await sheet();
    await screen.findByText('Jane Austen');
    read(platform);
    expect(scanned(platform, ISBN13)).toHaveLength(1);
    expect(platform.fake.calls.filter((c) => c.path.includes('/lookup/'))).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Chiudi' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    read(platform);
    await screen.findByText('Jane Austen');
    expect(scanned(platform, ISBN13)).toHaveLength(2);
  });
});
