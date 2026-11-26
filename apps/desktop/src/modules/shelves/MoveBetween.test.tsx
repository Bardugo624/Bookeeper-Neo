import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dragOverTab, dropOnTab } from './dnd';
import { HOVER_OPEN_MS } from './useTabDrop';
import { book, placeBodies, renderShelves, shelf, type World } from './testkit';

function world(over: Partial<World> = {}): World {
  return {
    shelves: [shelf(1, { rows: 2, slots_per_row: 3 }), shelf(2, { rows: 1, slots_per_row: 3, capacity: 3 })],
    books: ['b1', 'b2', 'b3', 'b4', 'c1', 'u1'].map((id) => book(id)),
    spots: {
      b1: { shelf: 's1', row: 0, slot: 0 },
      b2: { shelf: 's1', row: 0, slot: 1 },
      b3: { shelf: 's1', row: 0, slot: 2 },
      b4: { shelf: 's1', row: 1, slot: 0 },
      c1: { shelf: 's2', row: 0, slot: 0 },
    },
    ...over,
  };
}

afterEach(() => vi.useRealTimers());

async function openSpine(id: string) {
  await userEvent.click(await screen.findByRole('button', { name: `Libro ${id}, Autore ${id}` }));
  return within(await screen.findByRole('dialog'));
}

describe('dragging onto a cabinet tab', () => {
  it('opens the cabinet after the rest, not before', async () => {
    const { router } = renderShelves(world());
    await screen.findByRole('button', { name: 'Libro b1, Autore b1' });
    vi.useFakeTimers();
    const tab = dragOverTab('Mobile 2', 'u1');
    expect(tab).toHaveAttribute('data-drop-over', 'true');
    act(() => void vi.advanceTimersByTime(HOVER_OPEN_MS - 1));
    expect(router.state.location.search).toBe('');
    act(() => void vi.advanceTimersByTime(1));
    vi.useRealTimers();
    expect(router.state.location.search).toBe('?unit=s2');
    expect(await screen.findByRole('button', { name: 'Libro c1, Autore c1' })).toBeInTheDocument();
  });

  it('drops on the tab into the first shelf with a free place', async () => {
    const w = world();
    const { platform } = renderShelves(w, '/shelves?unit=s2');
    await screen.findByRole('button', { name: 'Libro c1, Autore c1' });
    dropOnTab('Mobile 1', 'u1');
    await waitFor(() => expect(w.spots.u1).toEqual({ shelf: 's1', row: 1, slot: 1 }));
    // The first shelf is full: it asked the second.
    expect(placeBodies(platform)).toEqual([
      { shelf_id: 's1', row_index: 0 },
      { shelf_id: 's1', row_index: 1 },
    ]);
    expect(await screen.findByRole('button', { name: 'Libro u1, Autore u1' })).toBeInTheDocument();
  });

  it('takes no second drop while the first is being written', async () => {
    let open!: () => void;
    const w = world({ gate: new Promise<void>((r) => (open = r)) });
    const { platform } = renderShelves(w, '/shelves?unit=s2');
    await screen.findByRole('button', { name: 'Libro c1, Autore c1' });
    dropOnTab('Mobile 1', 'u1');
    await waitFor(() => expect(placeBodies(platform)).toHaveLength(1));
    dropOnTab('Mobile 1', 'u1');
    open();
    await waitFor(() => expect(w.spots.u1).toBeDefined());
    // One drop: the first row is full, so it asked the second; the second drop asked nothing.
    expect(placeBodies(platform)).toEqual([
      { shelf_id: 's1', row_index: 0 },
      { shelf_id: 's1', row_index: 1 },
    ]);
  });

  it('moves a placed book of another cabinet the same way', async () => {
    const w = world();
    renderShelves(w, '/shelves?unit=s1');
    await screen.findByRole('button', { name: 'Libro b1, Autore b1' });
    dropOnTab('Mobile 2', 'b1');
    await waitFor(() => expect(w.spots.b1).toEqual({ shelf: 's2', row: 0, slot: 1 }));
  });

  it('says the cabinet is full when every shelf is', async () => {
    const w = world({ spots: { ...world().spots, c2: { shelf: 's2', row: 0, slot: 1 }, c3: { shelf: 's2', row: 0, slot: 2 } } });
    w.books.push(book('c2'), book('c3'));
    renderShelves(w);
    await screen.findByRole('button', { name: 'Libro b1, Autore b1' });
    dropOnTab('Mobile 2', 'u1');
    expect(await screen.findByText('Il mobile è pieno.')).toBeInTheDocument();
    expect(w.spots.u1).toBeUndefined();
    expect(await screen.findByText('Libro u1')).toBeInTheDocument();
  });

  it('is no target without write permission', async () => {
    const w = world({ role: 'guest' });
    const { platform } = renderShelves(w);
    await screen.findByRole('button', { name: 'Libro b1, Autore b1' });
    const tab = dragOverTab('Mobile 2', 'u1');
    expect(tab).not.toHaveAttribute('data-drop-over');
    dropOnTab('Mobile 2', 'u1');
    expect(placeBodies(platform)).toEqual([]);
  });
});

describe('"Sposta in…"', () => {
  it('opens with the cabinet and shelf of the book chosen and moves it elsewhere', async () => {
    const w = world();
    const user = userEvent.setup();
    renderShelves(w);
    const menu = await openSpine('b4');
    await user.click(menu.getByRole('button', { name: 'Sposta in…' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByRole('combobox', { name: 'Mobile' })).toHaveValue('s1');
    expect(dialog.getByRole('combobox', { name: 'Ripiano' })).toHaveValue('1');
    await user.selectOptions(dialog.getByRole('combobox', { name: 'Mobile' }), 's2');
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Colloca' })).toBeEnabled());
    await user.click(dialog.getByRole('button', { name: 'Colloca' }));
    await waitFor(() => expect(w.spots.b4).toEqual({ shelf: 's2', row: 0, slot: 1 }));
  });

  it('closes when confirmed on the place the book already has', async () => {
    const w = world();
    const user = userEvent.setup();
    renderShelves(w);
    const menu = await openSpine('b3');
    await user.click(menu.getByRole('button', { name: 'Sposta in…' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Colloca' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(w.spots.b3).toEqual({ shelf: 's1', row: 0, slot: 2 });
  });
});

describe('spine width', () => {
  it.each([
    ['Sottile', 1],
    ['Medio', 2],
    ['Largo', 3],
  ])('"%s" sends %i and keeps the position', async (name, width) => {
    const w = world();
    const { platform } = renderShelves(w);
    const menu = await openSpine('b2');
    await userEvent.click(menu.getByRole('radio', { name }));
    await waitFor(() => expect(w.widths?.b2).toBe(width));
    expect(placeBodies(platform)).toEqual([{ shelf_id: 's1', row_index: 0, slot_index: 1, spine_width: width }]);
    await waitFor(() => expect(menu.getByRole('radio', { name })).toBeChecked());
  });

  it('"Dalle pagine" sends no value', async () => {
    const w = world({ widths: { b2: 3 } });
    const { platform } = renderShelves(w);
    const menu = await openSpine('b2');
    expect(menu.getByRole('radio', { name: 'Largo' })).toBeChecked();
    await userEvent.click(menu.getByRole('radio', { name: 'Dalle pagine' }));
    await waitFor(() => expect(placeBodies(platform)).toEqual([{ shelf_id: 's1', row_index: 0, slot_index: 1, spine_width: null }]));
    // The width is really gone after the reload, and the radio stays on "Dalle pagine".
    await waitFor(() => expect(w.widths?.b2).toBeUndefined());
    await waitFor(() => expect(menu.getByRole('radio', { name: 'Dalle pagine' })).toBeChecked());
  });

  it('puts the choice back when the core refuses', async () => {
    renderShelves(world({ placeFails: 500, widths: { b2: 3 } }));
    const menu = await openSpine('b2');
    await userEvent.click(menu.getByRole('radio', { name: 'Sottile' }));
    expect(await screen.findByText('Non è stato possibile cambiare la larghezza del dorso')).toBeInTheDocument();
    await waitFor(() => expect(menu.getByRole('radio', { name: 'Largo' })).toBeChecked());
  });
});

describe('without write permission', () => {
  it('offers neither move nor width in the spine menu', async () => {
    renderShelves(world({ role: 'guest' }));
    const menu = await openSpine('b2');
    expect(menu.getByRole('link', { name: 'Apri scheda' })).toBeInTheDocument();
    expect(menu.queryByRole('button', { name: 'Sposta in…' })).toBeNull();
    expect(menu.queryByRole('radio')).toBeNull();
  });
});
