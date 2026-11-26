import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FakePlatform } from '../../platform/testing';
import { memoryIndex } from './libraryIndex';
import { ISBN13, book, entry, meta, renderScan, scanPlatform, type Server } from './testkit';

async function start(s: Server, opts: { online?: boolean; stored?: boolean; at?: number } = {}) {
  const index = memoryIndex();
  if (opts.stored !== false) await index.replace('v1', [entry()], opts.at ?? new Date(2026, 0, 5, 14, 32).getTime());
  const { platform } = scanPlatform(s, { online: opts.online ?? true });
  renderScan(platform, '/scan', index);
  await screen.findByText('Inquadra il codice a barre sul retro del libro');
  return platform;
}
const read = (platform: FakePlatform) => act(() => platform.scanner.emit({ text: ISBN13, format: 'ean_13' }));
const lookups = (platform: FakePlatform) =>
  platform.fake.calls.filter((c) => c.path.startsWith('/api/v1/books?') || c.path.includes('/lookup/'));

describe('known to the phone', () => {
  it('answers from the local copy without a network', async () => {
    const platform = await start({}, { online: false });
    read(platform);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('È nella tua libreria')).toBeInTheDocument();
    expect(within(dialog).getByText('Si trova in: Salotto, ripiano 2')).toBeInTheDocument();
    expect(within(dialog).getByText('Dune')).toBeInTheDocument();
    expect(lookups(platform)).toHaveLength(0);
  });

  it('shows the local answer at once and then the server data', async () => {
    const platform = await start({
      books: [book({ isbn_13: ISBN13, title: 'Dune (server)', placement: { shelf_id: 's1', row_index: 2 } as never })],
    });
    read(platform);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Si trova in: Salotto, ripiano 3')).toBeInTheDocument();
    expect(within(dialog).getByText('Dune (server)')).toBeInTheDocument();
  });

  it('keeps the local answer when the server fails', async () => {
    const platform = await start({ extra: (c) => (c.path.startsWith('/api/v1/books?') ? { status: 500, body: null } : undefined) });
    read(platform);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Si trova in: Salotto, ripiano 2')).toBeInTheDocument();
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });
});

describe('not known to the phone', () => {
  it('says so with the time of the copy, and does not search online', async () => {
    const platform = await start({ lookup: meta() }, { online: false, at: new Date(2026, 0, 5, 14, 32).getTime() });
    // Another ISBN than the stored one.
    act(() => platform.scanner.emit({ text: '9788804668237', format: 'ean_13' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Non risulta nella tua libreria')).toBeInTheDocument();
    expect(within(dialog).getByText('Dati aggiornati alle 14:32')).toBeInTheDocument();
    expect(lookups(platform)).toHaveLength(0);
  });

  it('tells when no copy was ever downloaded', async () => {
    const platform = await start({}, { online: false, stored: false });
    read(platform);
    expect(await screen.findByText("Non ho ancora scaricato l'elenco dei libri della libreria.")).toBeInTheDocument();
  });

  it('with a network, goes on as usual', async () => {
    const platform = await start({ lookup: meta() });
    act(() => platform.scanner.emit({ text: '9788804668237', format: 'ean_13' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Jane Austen')).toBeInTheDocument();
    expect(lookups(platform).some((c) => c.path.includes('/lookup/'))).toBe(true);
  });
});

describe('cold start without a network', () => {
  it('answers from the local copy when /me cannot be read', async () => {
    const index = memoryIndex();
    await index.replace('v1', [entry()], new Date(2026, 0, 5, 14, 32).getTime());
    const { platform } = scanPlatform(
      { extra: (c) => (c.path === '/api/v1/me' ? { status: 503, body: { error_code: 'x', message: 'x' } } : undefined) },
      { online: false },
    );
    platform.storage.set('bookeeper.scan.libraryId', 'l1');
    renderScan(platform, '/scan', index);
    await screen.findByText('Inquadra il codice a barre sul retro del libro');
    read(platform);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('È nella tua libreria')).toBeInTheDocument();
  });
});
