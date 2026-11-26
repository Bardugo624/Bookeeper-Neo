import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { groupByRoom, rowFills } from './shelfRows';
import { owned, shelfPlatform, unit, world } from './shelfKit';
import { renderScan } from './testkit';

describe('grouping', () => {
  it('groups by room in order, the shelves without a room last', () => {
    const groups = groupByRoom([
      unit({ id: 'a', room: { id: 'r1', name: 'Salotto' } }),
      unit({ id: 'b', room: null, room_id: null }),
      unit({ id: 'c', room: { id: 'r2', name: 'Studio' } }),
      unit({ id: 'd', room: { id: 'r1', name: 'Salotto' } }),
    ]);
    expect(groups.map((g) => [g.room, g.shelves.map((s) => s.id)])).toEqual([
      ['Salotto', ['a', 'd']],
      ['Studio', ['c']],
      [null, ['b']],
    ]);
  });

  it('counts the free places after the last book of each row', () => {
    const fills = rowFills(unit({ rows: 2, slots_per_row: 4 }), [
      { book_id: 'x', title: 'x', authors: [], row_index: 0, slot_index: 3 },
      { book_id: 'y', title: 'y', authors: [], row_index: 1, slot_index: 0 },
    ]);
    expect(fills).toEqual([
      { row: 0, books: 1, free: 0 },
      { row: 1, books: 1, free: 3 },
    ]);
  });
});

describe('choosing the row', () => {
  it('lists the furniture by room, then the rows with their fill, and a full row cannot be chosen', async () => {
    const user = userEvent.setup();
    const w = world({
      shelves: [
        unit({ id: 's1', name: 'Libreria', room: { id: 'r1', name: 'Salotto' } }),
        unit({ id: 's2', name: 'Mensola', room: { id: 'r2', name: 'Studio' } }),
        unit({ id: 's3', name: 'Cassa', room: null, room_id: null }),
      ],
    });
    for (let i = 0; i < 4; i += 1) owned(w, i + 1, { shelf_id: 's1', row_index: 0, slot_index: i });
    owned(w, 5, { shelf_id: 's1', row_index: 1, slot_index: 0 });
    const { platform } = shelfPlatform(w);
    renderScan(platform, '/scan/shelf');

    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['Salotto', 'Studio', 'Senza stanza']);
    await user.click(screen.getByRole('button', { name: /Libreria/ }));

    const full = await screen.findByRole('button', { name: /Ripiano 1/ });
    expect(full).toBeDisabled();
    expect(within(full).getByText('4 libri · 0 posti liberi')).toBeInTheDocument();
    const open = screen.getByRole('button', { name: /Ripiano 2/ });
    expect(open).toBeEnabled();
    expect(within(open).getByText('1 libro · 3 posti liberi')).toBeInTheDocument();
  });
});
