import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWishlist, renderWithProbe, wish } from './testkit';

const titles = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe('list', () => {
  const items = [
    wish(1, { title: 'Alfa', priority: 0 }),
    wish(2, { title: 'Beta', priority: 2 }),
    wish(3, { title: 'Gamma', priority: 1 }),
    wish(4, { title: 'Delta', priority: 2 }),
  ];

  it('shows the count and orders by priority, newest first', async () => {
    renderWishlist({ items });
    await screen.findByText('Alfa');
    expect(screen.getByText('4 libri desiderati')).toBeInTheDocument();
    expect(titles()).toEqual(['Delta', 'Beta', 'Gamma', 'Alfa']);
  });

  it('filters by priority and keeps the choice in the address', async () => {
    const { router } = renderWishlist({ items });
    await screen.findByText('Alfa');
    await userEvent.click(screen.getByRole('tab', { name: 'Alta' }));
    expect(titles()).toEqual(['Delta', 'Beta']);
    expect(router.state.location.search).toBe('?priority=2');
  });

  it('reads filter and sort from the address, sorting by date', async () => {
    renderWishlist({ items }, '/wishlist?sort=date');
    await screen.findByText('Alfa');
    expect(titles()).toEqual(['Delta', 'Gamma', 'Beta', 'Alfa']);
  });

  it('shows an empty state with no items and one for a filter with no match', async () => {
    renderWishlist({ items: [wish(1, { priority: 0 })] }, '/wishlist?priority=2');
    expect(await screen.findByText('Nessun risultato')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mostra tutti' }));
    expect(await screen.findByText('Desiderio 1')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    renderWishlist({ items: [] });
    expect(await screen.findByText('La wishlist è vuota')).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    renderWishlist({ items: [], listFails: true });
    expect(await screen.findByText('Impossibile caricare la wishlist')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeInTheDocument();
  });

  it('opens http(s) links outside the app and never links other schemes', async () => {
    renderWishlist({
      items: [
        wish(1, { title: 'Buono', source_url: 'https://example.com/libro' }),
        wish(2, { title: 'Cattivo', source_url: 'javascript:alert(1)' }),
      ],
    });
    await screen.findByText('Buono');
    const links = screen.getAllByRole('link', { name: 'Apri il collegamento' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://example.com/libro');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noreferrer');
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
  });

  it('formats the date in the language of the app', async () => {
    renderWishlist({ items: [wish(1, { created_at: 1_700_000_000 })] }, '/wishlist', 'en');
    expect(await screen.findByText(/^Added /)).toBeInTheDocument();
    expect(screen.getByText('1 wished book')).toBeInTheDocument();
  });
});

describe('permissions', () => {
  it('hides every write action from a guest', async () => {
    renderWishlist({ items: [wish(1)], role: 'guest' });
    await screen.findByText('Desiderio 1');
    expect(within(screen.getByRole('main')).queryByRole('button')).toBeNull();
  });
});

describe('add and edit', () => {
  it('validates with the limits of the core and sends the body', async () => {
    const { platform } = renderWishlist({ items: [wish(1)] });
    await screen.findByText('Desiderio 1');
    await userEvent.click(screen.getByRole('button', { name: 'Aggiungi' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    expect(await within(dialog).findByText('Campo obbligatorio')).toBeInTheDocument();
    expect(platform.calls.some((c) => c.method === 'POST')).toBe(false);

    await userEvent.type(within(dialog).getByLabelText('Titolo'), 'Il Gattopardo');
    await userEvent.type(within(dialog).getByLabelText('Autori'), 'Tomasi di Lampedusa');
    await userEvent.type(within(dialog).getByLabelText('ISBN'), '1'.repeat(21));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    expect(await within(dialog).findByText('Al massimo 20 caratteri')).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText('ISBN'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const post = platform.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/wishlist');
    expect(post?.body).toEqual({ title: 'Il Gattopardo', authors: 'Tomasi di Lampedusa', priority: 1 });
    expect(await screen.findByText('Il Gattopardo')).toBeInTheDocument();
  });

  it('edits a wish and clears emptied optional fields with null', async () => {
    const { platform } = renderWishlist({ items: [wish(1, { title: 'Vecchio', authors: 'Qualcuno', priority: 0 })] });
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica Vecchio' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Titolo')).toHaveValue('Vecchio');
    await userEvent.clear(within(dialog).getByLabelText('Titolo'));
    await userEvent.type(within(dialog).getByLabelText('Titolo'), 'Nuovo');
    await userEvent.clear(within(dialog).getByLabelText('Autori'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const patch = platform.calls.find((c) => c.method === 'PATCH');
    expect(patch?.path).toBe('/api/v1/wishlist/w1');
    expect(patch?.body).toEqual({ title: 'Nuovo', priority: 0, isbn: null, authors: null, source_url: null, notes: null });
    expect(await screen.findByText('Nuovo')).toBeInTheDocument();
  });
});

describe('delete', () => {
  it('asks first and names the item', async () => {
    const { platform } = renderWishlist({ items: [wish(1, { title: 'Da togliere' }), wish(2)] });
    await userEvent.click(await screen.findByRole('button', { name: 'Elimina Da togliere' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/«Da togliere»/)).toBeInTheDocument();
    expect(platform.calls.some((c) => c.method === 'DELETE')).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Elimina' }));
    await waitFor(() => expect(screen.queryByText('Da togliere')).toBeNull());
    expect(platform.calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual(['/api/v1/wishlist/w1']);
  });

  it('does nothing when cancelled', async () => {
    const { platform } = renderWishlist({ items: [wish(1, { title: 'Resta' })] });
    await userEvent.click(await screen.findByRole('button', { name: 'Elimina Resta' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Annulla' }));
    expect(platform.calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(screen.getByText('Resta')).toBeInTheDocument();
  });
});

describe('errors', () => {
  it('clears a failed delete once another action succeeds', async () => {
    renderWishlist({ items: [wish(1, { title: 'Resta' })], deleteFails: 500 });
    await userEvent.click(await screen.findByRole('button', { name: 'Elimina Resta' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Elimina' }));
    await waitFor(() => expect(document.querySelector('p[role="alert"]')).not.toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Aggiungi' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Titolo'), 'Nuovo');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.querySelector('p[role="alert"]')).toBeNull();
  });
});

describe('convert', () => {
  it('converts, removes the item, offers the book and invalidates books and stats', async () => {
    const { platform, router } = renderWishlist({ items: [wish(1, { title: 'Comprato' }), wish(2, { title: 'Resta' })] });
    await userEvent.click(await screen.findByRole('button', { name: 'Ho comprato Comprato' }));
    await screen.findByText('Aggiunto ai libri');
    const calls = platform.calls.filter((c) => c.method === 'POST');
    expect(calls.map((c) => c.path)).toEqual(['/api/v1/wishlist/w1/convert']);
    expect(calls[0]?.body).toBeUndefined();
    await waitFor(() => expect(screen.queryByText('Comprato', { selector: 'h2' })).toBeNull());
    expect(screen.getByText('Resta')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Apri' }));
    expect(router.state.location.pathname).toBe('/books/b9');
  });

  it('leaves no notice of its own: the shared toast carries the action', async () => {
    renderWishlist({ items: [wish(1)] });
    await userEvent.click(await screen.findByRole('button', { name: 'Ho comprato Desiderio 1' }));
    await screen.findByText('Aggiunto ai libri');
    expect(screen.queryByRole('link', { name: 'Apri' })).toBeNull();
  });

  it('invalidates the queries of books and stats', async () => {
    const { platform } = renderWithProbe({ items: [wish(1)] });
    const count = (path: string) => platform.calls.filter((c) => c.method === 'GET' && c.path.startsWith(path)).length;
    await screen.findByText('Desiderio 1');
    await waitFor(() => expect(count('/api/v1/books')).toBe(1));
    await waitFor(() => expect(count('/api/v1/shelves')).toBe(1));
    await userEvent.click(screen.getByRole('button', { name: 'Ho comprato Desiderio 1' }));
    await screen.findByText('Aggiunto ai libri');
    await waitFor(() => expect(count('/api/v1/books')).toBe(2));
    await waitFor(() => expect(count('/api/v1/shelves')).toBe(2));
  });

  it('shows the error and keeps the item when the core refuses', async () => {
    renderWishlist({ items: [wish(1)], convertFails: 422 });
    await userEvent.click(await screen.findByRole('button', { name: 'Ho comprato Desiderio 1' }));
    expect(await screen.findByText(/Alcuni dati non sono validi/)).toBeInTheDocument();
    expect(screen.getByText('Desiderio 1')).toBeInTheDocument();
  });
});
