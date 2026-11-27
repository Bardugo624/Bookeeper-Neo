import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FACETS, FACET_SHELVES, book, installIntersectionObserver, listCalls, makeDb, renderBooks } from './testkit';
import { openGroup, openNewBook, renderWithWrites, sent, stored } from './writeKit';

// jsdom lacks the pointer-capture and scroll APIs Radix Select calls.
const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
proto.hasPointerCapture ??= () => false;
proto.setPointerCapture ??= () => undefined;
proto.releasePointerCapture ??= () => undefined;
proto.scrollIntoView ??= () => undefined;

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});
afterEach(() => vi.unstubAllGlobals());

const people = [
  { id: 'u1', display_name: 'Anna', is_me: true },
  { id: 'u2', display_name: 'Marco' },
];
const facets = {
  ...FACETS,
  owners: [
    { id: 'u1', display_name: 'Anna', count: 2 },
    { id: 'u2', display_name: 'Marco', count: 1 },
  ],
  owner_none: 3,
};
const lib = () => ({ books: makeDb(4), shelves: FACET_SHELVES, facets, people });
const last = (platform: Parameters<typeof listCalls>[0]) => listCalls(platform).filter((p) => p.get('limit') === '60').at(-1)!;

async function pickOwner(name: string) {
  await openGroup('Raccolta');
  await userEvent.click(await screen.findByRole('combobox', { name: 'Di chi è' }));
  await userEvent.click(await screen.findByRole('option', { name }));
}

describe('owner in the form', () => {
  it('creates a book with an owner', async () => {
    const { platform } = renderWithWrites({ books: [], people });
    await openNewBook();
    await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Titolo' }), 'Dune');
    await pickOwner('Marco');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(sent(platform, 'POST', '/api/v1/books')).toHaveLength(1));
    expect(sent(platform, 'POST', '/api/v1/books')[0]!.body).toMatchObject({ title: 'Dune', owner_user_id: 'u2' });
  });

  it('names the caller "Tu" and changes the owner of a book', async () => {
    const { platform } = renderWithWrites({ books: [stored({ owner: { id: 'u2', display_name: 'Marco' } })], people }, {
      'PATCH /api/v1/books/b1': (r) => ({ status: 200, body: { ...stored(), ...(r.body as object) } }),
    }, '/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica' }));
    expect(await screen.findByRole('combobox', { name: 'Di chi è' })).toHaveTextContent('Marco');
    await pickOwner('Tu');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(sent(platform, 'PATCH', '/api/v1/books/b1')).toHaveLength(1));
    expect(sent(platform, 'PATCH', '/api/v1/books/b1')[0]!.body).toEqual({ owner_user_id: 'u1' });
  });

  it('removes the owner with "Di tutti"', async () => {
    const { platform } = renderWithWrites({ books: [stored({ owner: { id: 'u2', display_name: 'Marco' } })], people }, {
      'PATCH /api/v1/books/b1': (r) => ({ status: 200, body: { ...stored(), ...(r.body as object) } }),
    }, '/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica' }));
    await screen.findByRole('combobox', { name: 'Di chi è' });
    await pickOwner('Di tutti');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(sent(platform, 'PATCH', '/api/v1/books/b1')).toHaveLength(1));
    expect(sent(platform, 'PATCH', '/api/v1/books/b1')[0]!.body).toEqual({ owner_user_id: null });
  });
});

describe('owner and readers on the detail', () => {
  it('shows the owner line, and none for a book of everyone', async () => {
    const view = renderBooks({ books: [book(1, { owner: { id: 'u2', display_name: 'Marco' } })], people }, '/books/b1');
    expect(await screen.findByText('Di chi è: Marco')).toBeInTheDocument();
    view.unmount();
    renderBooks({ books: [book(1)], people }, '/books/b1');
    await screen.findByRole('heading', { level: 1, name: 'Libro 1' });
    expect(screen.queryByText(/^Di chi è/)).toBeNull();
  });

  it('says "Tu" when the book is the caller\'s', async () => {
    renderBooks({ books: [book(1, { owner: { id: 'u1', display_name: 'Anna' } })], people }, '/books/b1');
    expect(await screen.findByText('Di chi è: Tu')).toBeInTheDocument();
  });

  it('lists the readers with the four phrases', async () => {
    const readers = [
      { user: { id: 'u2', display_name: 'Marco' }, is_me: false, status: 'reading' },
      { user: { id: 'u3', display_name: 'Anna' }, is_me: false, status: 'read', finished_at: Date.UTC(2026, 2, 15) / 1000 },
      { user: { id: 'u1', display_name: 'Anna' }, is_me: true, status: 'to_read' },
      { user: { id: 'u4', display_name: 'Luca' }, is_me: false, status: 'abandoned' },
    ];
    renderBooks({ books: [book(1)], people, readers: { b1: readers } }, '/books/b1');
    const block = await screen.findByRole('region', { name: 'Chi lo legge' });
    expect(within(block).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Marco · sta leggendo',
      'Anna · l’ha letto a marzo 2026',
      'Tu · da leggere',
      'Luca · l’ha lasciato',
    ]);
  });

  it('shows no block when nobody has a state', async () => {
    renderBooks({ books: [book(1)], people, readers: { b1: [] } }, '/books/b1');
    await screen.findByRole('heading', { level: 1, name: 'Libro 1' });
    expect(screen.queryByText('Chi lo legge')).toBeNull();
  });
});

describe('owner filter', () => {
  it('reads ?owner= from the address and sends owner_id', async () => {
    const { platform } = renderBooks(lib(), '/books?owner=u2');
    await waitFor(() => expect(last(platform).get('owner_id')).toBe('u2'));
    expect(await screen.findByRole('button', { name: 'Togli il filtro: Di chi è: Marco' })).toBeInTheDocument();
  });

  it('labels "me" and "none"', async () => {
    const view = renderBooks(lib(), '/books?owner=me');
    expect(await screen.findByRole('button', { name: 'Togli il filtro: Di chi è: I miei' })).toBeInTheDocument();
    view.unmount();
    renderBooks(lib(), '/books?owner=none');
    expect(await screen.findByRole('button', { name: 'Togli il filtro: Di chi è: Di tutti' })).toBeInTheDocument();
  });

  it('picks from the panel with counts and writes the address', async () => {
    const { platform, router } = renderBooks(lib(), '/books');
    await userEvent.click(await screen.findByRole('button', { name: /^Filtri/ }));
    const panel = await screen.findByRole('dialog', { name: 'Filtri' });
    expect(await within(panel).findByRole('button', { name: 'I miei (2)' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Di tutti (3)' })).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Marco (1)' }));
    await userEvent.click(within(panel).getByRole('button', { name: /^Mostra/ }));
    await waitFor(() => expect(last(platform).get('owner_id')).toBe('u2'));
    expect(new URLSearchParams(router.state.location.search).get('owner')).toBe('u2');
  });

  it('names a person with no books from /users and lists them with 0 in the panel', async () => {
    const view = { ...lib(), people: [...people, { id: 'u3', display_name: 'Chiara' }] };
    const { router } = renderBooks(view, '/books?owner=u3');
    const chip = await screen.findByRole('button', { name: 'Togli il filtro: Di chi è: Chiara' });
    expect(chip).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /^Filtri/ }));
    const panel = await screen.findByRole('dialog', { name: 'Filtri' });
    const pressed = await within(panel).findByRole('button', { name: 'Chiara (0)' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(pressed);
    await userEvent.click(within(panel).getByRole('button', { name: /^Mostra/ }));
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('owner')).toBeNull());
  });

  it('removes the label and the filter', async () => {
    const { platform, router } = renderBooks(lib(), '/books?owner=none');
    await userEvent.click(await screen.findByRole('button', { name: 'Togli il filtro: Di chi è: Di tutti' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    await waitFor(() => expect(last(platform).get('owner_id')).toBeNull());
  });

  it('keeps the owner in a saved view', async () => {
    renderBooks(lib(), '/books?owner=u2');
    await userEvent.click(await screen.findByRole('button', { name: 'Viste' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Salva questa vista' }));
    const dialog = await screen.findByRole('dialog', { name: 'Salva questa vista' });
    await userEvent.type(within(dialog).getByLabelText('Nome della vista'), 'Di Marco');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(localStorage.getItem('bookeeper.books.views.c1')).toContain('owner=u2'));
  });
});
