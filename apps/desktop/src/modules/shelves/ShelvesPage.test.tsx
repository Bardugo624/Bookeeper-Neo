import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { dropOnRow, startDrag } from './dnd';
import { book, placementRequests, placements, renderShelves, shelf, type World } from './testkit';

function world(over: Partial<World> = {}): World {
  return {
    shelves: [shelf(1), shelf(2, { color: 'terracotta', rows: 1, slots_per_row: 5, capacity: 5 })],
    books: ['b1', 'b2', 'b3', 'b4', 'c1', 'c2', 'c3', 'c4', 'u1', 'u2', 'u3'].map((id) => book(id)),
    spots: {
      b1: { shelf: 's1', row: 0, slot: 0 },
      b2: { shelf: 's1', row: 0, slot: 1 },
      b3: { shelf: 's1', row: 0, slot: 2 },
      b4: { shelf: 's1', row: 1, slot: 0 },
      c1: { shelf: 's2', row: 0, slot: 0 },
      c2: { shelf: 's2', row: 0, slot: 1 },
      c3: { shelf: 's2', row: 0, slot: 2 },
      c4: { shelf: 's2', row: 0, slot: 3 },
    },
    ...over,
  };
}

const spineNames = (row: string) =>
  within(screen.getByRole('group', { name: row }))
    .queryAllByRole('button')
    .map((b) => b.getAttribute('aria-label'));

describe('units and panel', () => {
  it('lists the units as tabs with the chosen one in the address', async () => {
    const { router } = renderShelves(world());
    expect(await screen.findByText('2 mobili · 8 libri collocati')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Mobile 1', 'Mobile 2']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(tabs[1]!);
    expect(router.state.location.search).toBe('?unit=s2');
    expect(await screen.findByRole('button', { name: 'Libro c1, Autore c1' })).toBeInTheDocument();
  });

  it('opens the unit named in the address', async () => {
    renderShelves(world(), '/shelves?unit=s2');
    expect(await screen.findByRole('heading', { level: 2, name: 'Mobile 2' })).toBeInTheDocument();
  });

  it('shows the fill with its tone and the free places', async () => {
    renderShelves(world(), '/shelves?unit=s1');
    expect(await screen.findByText('4 libri · circa 16 posti liberi')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Riempimento di Mobile 1' })).toHaveAttribute('data-tone', 'ok');
    await userEvent.click(screen.getByRole('tab', { name: 'Mobile 2' }));
    expect(await screen.findByText('4 libri · circa 1 posto libero')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Riempimento di Mobile 2' })).toHaveAttribute('data-tone', 'warn');
  });

  it('leaves out free places and the bar when the core gives no capacity', async () => {
    renderShelves(world({ shelves: [shelf(1, { capacity: 0, book_count: 0 })], spots: {} }));
    expect(await screen.findByText('0 libri')).toBeInTheDocument();
    expect(screen.queryByText(/posti liberi/)).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('highlights the spine named by ?book', async () => {
    renderShelves(world(), '/shelves?unit=s1&book=b2');
    expect(await screen.findByRole('button', { name: 'Libro b2, Autore b2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Libro b1, Autore b1' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the book page from a spine', async () => {
    const { router } = renderShelves(world());
    await userEvent.click(await screen.findByRole('button', { name: 'Libro b1, Autore b1' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('link', { name: 'Apri scheda' }));
    expect(router.state.location.pathname).toBe('/books/b1');
  });
});

describe('unplaced books', () => {
  it('lists them with a count and searches', async () => {
    renderShelves(world());
    const list = await screen.findByRole('list', { name: 'Non collocati' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: /Non collocati/ })).toHaveTextContent('3');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Cerca tra i non collocati' }), 'u2');
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Non collocati' })).getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByText('Libro u2')).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox'));
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(await screen.findByText('Nessun libro non collocato corrisponde alla ricerca.')).toBeInTheDocument();
  });

  it('says so when every book has a place', async () => {
    renderShelves(world({ books: world().books.filter((b) => !b.id.startsWith('u')) }));
    expect(await screen.findByText('Tutti i libri hanno un posto.')).toBeInTheDocument();
  });
});

describe('placing', () => {
  it('drops an unplaced book on a shelf: sends mobile, row and slot, and shows it at once', async () => {
    let open!: () => void;
    const w = world({ gate: new Promise<void>((r) => (open = r)) });
    const { platform } = renderShelves(w);
    await screen.findByRole('button', { name: 'Libro b2, Autore b2' });
    const row = screen.getByText('Libro u1').closest('li')!;
    expect(startDrag(row).getData('application/x-bookeeper-book')).toBe('u1');
    dropOnRow('u1', 'Ripiano 1', 20);
    // The core has not answered yet.
    expect(await screen.findByRole('button', { name: 'Libro u1, Autore u1' })).toBeInTheDocument();
    expect(spineNames('Ripiano 1')).toEqual([
      'Libro b1, Autore b1', 'Libro u1, Autore u1', 'Libro b2, Autore b2', 'Libro b3, Autore b3',
    ]);
    expect(screen.queryByText('Libro u1')).toBeNull();
    expect(w.spots.u1).toBeUndefined();
    open();
    await waitFor(() => expect(w.spots.u1).toEqual({ shelf: 's1', row: 0, slot: 1 }));
    // One request: the core makes room for it.
    expect(placements(platform)).toEqual([['u1', 0, 1]]);
    expect(placementRequests(platform)).toEqual([{ method: 'PUT', shift: true }]);
    expect(w.spots.b2).toEqual({ shelf: 's1', row: 0, slot: 2 });
    expect(w.spots.b3).toEqual({ shelf: 's1', row: 0, slot: 3 });
    await waitFor(() => expect(screen.queryByText('Libro u1')).toBeNull());
  });

  it('puts the order back and shows a toast when the core refuses', async () => {
    renderShelves(world({ placeFails: 500 }));
    await screen.findByRole('button', { name: 'Libro b2, Autore b2' });
    dropOnRow('u1', 'Ripiano 2', 500);
    expect(await screen.findByText('Non è stato possibile spostare il libro')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Libro u1, Autore u1' })).toBeNull());
    expect(spineNames('Ripiano 2')).toEqual(['Libro b4, Autore b4']);
    expect(await screen.findByText('Libro u1')).toBeInTheDocument();
  });

  it('moves a spine to another shelf with the same route', async () => {
    const w = world();
    const { platform } = renderShelves(w);
    await screen.findByRole('button', { name: 'Libro b1, Autore b1' });
    dropOnRow('b1', 'Ripiano 2', 500);
    await waitFor(() => expect(w.spots.b1).toEqual({ shelf: 's1', row: 1, slot: 1 }));
    expect(placements(platform)).toEqual([['b1', 1, 1]]);
    expect(spineNames('Ripiano 2')).toEqual(['Libro b4, Autore b4', 'Libro b1, Autore b1']);
  });

  it('takes a book off the shelf from the spine menu', async () => {
    const w = world();
    const { platform } = renderShelves(w);
    await userEvent.click(await screen.findByRole('button', { name: 'Libro b3, Autore b3' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Togli dallo scaffale' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(platform.calls.some((c) => c.method === 'DELETE' && c.path === '/api/v1/books/b3/placement')).toBe(true);
    expect(w.spots.b3).toBeUndefined();
    expect(await screen.findByText('Libro b3')).toBeInTheDocument();
  });

  it('places a book from the keyboard with "Colloca in…"', async () => {
    const w = world();
    const { platform } = renderShelves(w);
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Colloca «Libro u2» in…' });
    button.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Mobile'), 'Mobile 2');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Colloca' })).toBeEnabled());
    await user.click(within(dialog).getByRole('button', { name: 'Colloca' }));
    await waitFor(() => expect(w.spots.u2).toEqual({ shelf: 's2', row: 0, slot: 4 }));
    expect(placements(platform)).toEqual([['u2', 0, 4]]);
    expect(await screen.findByRole('button', { name: 'Libro u2, Autore u2' })).toBeInTheDocument();
  });

  it('refuses a full row with a toast and sends nothing', async () => {
    const w = world();
    w.books.push(book('c5'));
    w.spots.c5 = { shelf: 's2', row: 0, slot: 4 };
    const { platform } = renderShelves(w);
    await userEvent.click(await screen.findByRole('tab', { name: 'Mobile 2' }));
    await screen.findByRole('button', { name: 'Libro c1, Autore c1' });
    dropOnRow('u1', 'Ripiano 1', 500);
    expect(await screen.findByText('Il ripiano è pieno.')).toBeInTheDocument();
    expect(placements(platform)).toEqual([]);
    expect(screen.getByText('Libro u1')).toBeInTheDocument();
  });
});

describe('reordering', () => {
  const full = (over: Partial<World> = {}) => {
    const w = world(over);
    w.books.push(book('c5'));
    w.spots.c5 = { shelf: 's2', row: 0, slot: 4 };
    return w;
  };
  const order = (ids: string[]) => ids.map((id) => `Libro ${id}, Autore ${id}`);

  it('moves a book inside a full row with one request and no DELETE', async () => {
    const w = full();
    const { platform } = renderShelves(w, '/shelves?unit=s2');
    await screen.findByRole('button', { name: 'Libro c5, Autore c5' });
    dropOnRow('c5', 'Ripiano 1', 0);
    await waitFor(() => expect(w.spots.c5).toEqual({ shelf: 's2', row: 0, slot: 0 }));
    expect(placementRequests(platform)).toEqual([{ method: 'PUT', shift: true }]);
    expect(placements(platform)).toEqual([['c5', 0, 0]]);
    expect(spineNames('Ripiano 1')).toEqual(order(['c5', 'c1', 'c2', 'c3', 'c4']));
    expect(screen.queryByText('Il ripiano è pieno.')).toBeNull();
  });

  it('moves a book to the end of a full row with one request', async () => {
    const w = full();
    const { platform } = renderShelves(w, '/shelves?unit=s2');
    await screen.findByRole('button', { name: 'Libro c1, Autore c1' });
    dropOnRow('c1', 'Ripiano 1', 500);
    await waitFor(() => expect(w.spots.c1).toEqual({ shelf: 's2', row: 0, slot: 4 }));
    expect(placementRequests(platform)).toEqual([{ method: 'PUT', shift: true }]);
    expect(Object.entries(w.spots).filter(([id]) => id.startsWith('c')).map(([id, s]) => [id, s.slot])).toEqual(
      [['c1', 4], ['c2', 0], ['c3', 1], ['c4', 2], ['c5', 3]],
    );
    await waitFor(() => expect(spineNames('Ripiano 1')).toEqual(order(['c2', 'c3', 'c4', 'c5', 'c1'])));
  });

  it('moves a book between rows with one request', async () => {
    const w = world();
    const { platform } = renderShelves(w);
    await screen.findByRole('button', { name: 'Libro b3, Autore b3' });
    dropOnRow('b3', 'Ripiano 2', 0);
    await waitFor(() => expect(w.spots.b3).toEqual({ shelf: 's1', row: 1, slot: 0 }));
    expect(placementRequests(platform)).toEqual([{ method: 'PUT', shift: true }]);
    expect(w.spots.b4).toEqual({ shelf: 's1', row: 1, slot: 1 });
  });

  it('shows "row full" and restores the order when the core answers row_full', async () => {
    // Free slot 1, but the books from slot 3 on reach the end: sliding right has no room.
    const w = world({ shelves: [shelf(1), shelf(2, { rows: 1, slots_per_row: 5, capacity: 5 })] });
    w.spots = {
      c1: { shelf: 's2', row: 0, slot: 0 }, c2: { shelf: 's2', row: 0, slot: 2 },
      c3: { shelf: 's2', row: 0, slot: 3 }, c4: { shelf: 's2', row: 0, slot: 4 },
    };
    const { platform } = renderShelves(w, '/shelves?unit=s2');
    await screen.findByRole('button', { name: 'Libro c4, Autore c4' });
    const before = structuredClone(w.spots);
    dropOnRow('u1', 'Ripiano 1', 45);
    expect(await screen.findByText('Il ripiano è pieno.')).toBeInTheDocument();
    expect(placementRequests(platform)).toEqual([{ method: 'PUT', shift: true }]);
    await waitFor(() => expect(w.spots).toEqual(before));
    await waitFor(() => expect(spineNames('Ripiano 1')).toEqual(order(['c1', 'c2', 'c3', 'c4'])));
    expect(screen.getByText('Libro u1')).toBeInTheDocument();
  });

  it('never sends a DELETE while reordering, even when the request fails', async () => {
    const w = full({ placeFails: 500 });
    const before = structuredClone(w.spots);
    const { platform } = renderShelves(w, '/shelves?unit=s2');
    await screen.findByRole('button', { name: 'Libro c5, Autore c5' });
    dropOnRow('c5', 'Ripiano 1', 0);
    expect(await screen.findByText('Non è stato possibile spostare il libro')).toBeInTheDocument();
    expect(placementRequests(platform)).toEqual([{ method: 'PUT', shift: true }]);
    expect(w.spots).toEqual(before);
    await waitFor(() => expect(spineNames('Ripiano 1')).toEqual(order(['c1', 'c2', 'c3', 'c4', 'c5'])));
  });
});

describe('without write permission', () => {
  it('has nothing to edit and nothing draggable', async () => {
    renderShelves(world({ role: 'guest' }));
    await screen.findByRole('button', { name: 'Libro b1, Autore b1' });
    expect(screen.queryByRole('button', { name: 'Nuovo mobile' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Modifica/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Elimina/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Colloca/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Libro b1, Autore b1' })).toHaveAttribute('draggable', 'false');
    expect(screen.getByText('Libro u1').closest('li')).toHaveAttribute('draggable', 'false');
    dropOnRow('u1', 'Ripiano 1', 20);
    await userEvent.click(screen.getByRole('button', { name: 'Libro b1, Autore b1' }));
    expect(within(await screen.findByRole('dialog')).queryByRole('button', { name: 'Togli dallo scaffale' })).toBeNull();
  });
});

describe('states', () => {
  it('invites to create the first cabinet', async () => {
    renderShelves(world({ shelves: [], spots: {} }));
    expect(await screen.findByText('Nessun mobile')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crea il primo mobile' })).toBeInTheDocument();
  });

  it('shows no create button to a guest when there are no cabinets', async () => {
    renderShelves(world({ shelves: [], spots: {}, role: 'guest' }));
    expect(await screen.findByText('Nessun mobile')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crea il primo mobile' })).toBeNull();
  });

  it('shows empty shelves with an invitation for an empty cabinet', async () => {
    renderShelves(world({ spots: {} }));
    expect(await screen.findByText(/Trascina qui i libri/)).toBeInTheDocument();
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Ripiano 1', 'Ripiano 2']);
  });

  it('shows a loading state while the list is pending', async () => {
    renderShelves(world({ listPending: true }));
    expect(await screen.findByRole('status', { name: 'Caricamento degli scaffali' })).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    renderShelves(world({ listFails: true }));
    expect(await screen.findByText('Impossibile caricare gli scaffali')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeInTheDocument();
  });
});
