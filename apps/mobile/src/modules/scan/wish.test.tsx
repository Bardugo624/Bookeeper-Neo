import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ok } from '../../session/fixtures';
import { ISBN13, book, meta, renderScan, scanPlatform, type Server } from './testkit';

const withWishlist = (s: Server): Server => ({
  ...s,
  extra: (c) => (c.path === '/api/v1/wishlist' && c.method === 'POST' ? ok({ id: 'w1' }) : undefined),
});

async function scan(s: Server) {
  const { platform } = scanPlatform(withWishlist(s));
  renderScan(platform);
  await screen.findByText('Inquadra il codice a barre sul retro del libro');
  act(() => platform.scanner.emit({ text: ISBN13, format: 'ean_13' }));
  return { platform, dialog: await screen.findByRole('dialog') };
}

describe('"Add to the wishlist" from a scan', () => {
  it('is offered for a found book that is not owned, with its data', async () => {
    const user = userEvent.setup();
    const { platform, dialog } = await scan({ lookup: meta() });
    await user.click(await within(dialog).findByRole('button', { name: 'Aggiungi alla wishlist' }));
    const form = await screen.findByRole('dialog');
    expect(within(form).getByLabelText('Titolo')).toHaveValue('Emma');
    expect(within(form).getByLabelText('Autori')).toHaveValue('Jane Austen');
    expect(within(form).getByLabelText('ISBN')).toHaveValue(ISBN13);
    await user.click(within(form).getByRole('button', { name: 'Aggiungi alla wishlist' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const post = platform.fake.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/wishlist');
    expect(post?.body).toEqual({ title: 'Emma', priority: 1, isbn: ISBN13, authors: 'Jane Austen' });
  });

  it('gives the result back when the form is dismissed', async () => {
    const user = userEvent.setup();
    const { dialog } = await scan({ lookup: meta() });
    await user.click(await within(dialog).findByRole('button', { name: 'Aggiungi alla wishlist' }));
    await user.click(await screen.findByRole('button', { name: 'Chiudi' }));
    expect(await screen.findByRole('button', { name: 'Aggiungi alla libreria' })).toBeInTheDocument();
  });

  it('is absent for a book already owned', async () => {
    const { dialog } = await scan({ books: [book({ isbn_13: ISBN13 })], lookup: meta() });
    expect(await within(dialog).findByText('È nella tua libreria')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aggiungi alla wishlist' })).toBeNull();
  });

  it('is absent when nothing was found', async () => {
    const { dialog } = await scan({});
    expect(await within(dialog).findByText('Nessun dato trovato')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aggiungi alla wishlist' })).toBeNull();
  });

  it('is absent for a guest', async () => {
    const { dialog } = await scan({ lookup: meta(), role: 'guest' });
    expect(await within(dialog).findByText('Non puoi aggiungere libri a questa libreria.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aggiungi alla wishlist' })).toBeNull();
  });
});
