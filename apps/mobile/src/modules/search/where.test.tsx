import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { book, renderSearch } from './testkit';

afterEach(() => vi.restoreAllMocks());

const shelves = [{ id: 's1', name: 'Libreria del salotto' }];
const placed = { shelf_id: 's1', row_index: 2, slot_index: 11 };
const api = (placement: typeof placed | undefined, onShelf = true) => ({
  books: [book(1, { placement })],
  shelves,
  shelfBooks: {
    s1: [
      { book_id: 'b9', title: 'Altro', row_index: 0, slot_index: 0 },
      ...(onShelf ? [{ book_id: 'b1', title: 'Libro 1', row_index: 2, slot_index: 11 }] : []),
    ],
  },
});

describe('where page', () => {
  it('says where the book is and pulls its spine out', async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    renderSearch({ api: api(placed), route: '/books/b1/where' });
    expect(await screen.findByRole('heading', { level: 2, name: 'Libro 1' })).toBeInTheDocument();
    expect(await screen.findByText('Libreria del salotto · ripiano 3 · posto 12')).toHaveAttribute('role', 'status');
    await vi.waitFor(() => expect(document.querySelectorAll('[data-pulled="true"]')).toHaveLength(1));
    expect(document.querySelector('[data-pulled="true"]')?.getAttribute('aria-label') ?? document.querySelector('[data-pulled="true"]')?.textContent).toContain('Libro 1');
    await vi.waitFor(() => expect(scroll).toHaveBeenCalled());
  });

  it('offers no way to write: no draggable spine, no move or place button', async () => {
    renderSearch({ api: api(placed), route: '/books/b1/where' });
    await screen.findByText(/posto 12/);
    await vi.waitFor(() => expect(document.querySelector('[data-pulled="true"]')).not.toBeNull());
    expect(document.querySelectorAll('[draggable="true"]')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /sposta|colloca|rimuovi|move|place/i })).toBeNull();
  });

  it('says the book is on no shelf when it is not shelved', async () => {
    renderSearch({ api: api(undefined), route: '/books/b1/where' });
    expect(await screen.findByText('Non è su nessuno scaffale')).toBeInTheDocument();
    expect(document.querySelector('[data-pulled="true"]')).toBeNull();
  });

  it('says the same when the shelf no longer holds the book', async () => {
    renderSearch({ api: api(placed, false), route: '/books/b1/where' });
    expect(await screen.findByText('Non è su nessuno scaffale')).toBeInTheDocument();
    expect(screen.queryByText(/posto \d/)).toBeNull();
  });

  it('goes back to the book card, which goes back to the list with its filters', async () => {
    const user = userEvent.setup();
    const { router } = renderSearch({ api: api(placed), route: '/search?filter=loan' });
    // Reach the card from the list, then the page from the card.
    router.navigate('/books/b1', { state: { list: '?filter=loan' } });
    const where = await screen.findByRole('region', { name: 'Dove si trova' });
    await user.click(await within(where).findByRole('link', { name: "Dov'è?" }));
    await screen.findByText(/posto 12/);
    await user.click(screen.getByRole('link', { name: 'Torna alla scheda' }));
    expect(router.state.location.pathname).toBe('/books/b1');
    await user.click(await screen.findByRole('link', { name: "Torna all'elenco" }));
    expect(router.state.location.pathname).toBe('/search');
    expect(router.state.location.search).toBe('?filter=loan');
  });
});
