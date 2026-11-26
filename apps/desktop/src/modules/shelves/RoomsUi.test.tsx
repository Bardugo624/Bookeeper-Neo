import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { book, renderShelves, room, shelf, type World } from './testkit';

function world(over: Partial<World> = {}): World {
  return {
    shelves: [
      shelf(1, { name: 'Libreria', room_id: 'r2' }),
      shelf(2, { name: 'Credenza', room_id: 'r1' }),
      shelf(3, { name: 'Ripostiglio' }),
    ],
    rooms: [room('r1', 'Cucina'), room('r2', 'Studio')],
    books: [book('b1')],
    spots: {},
    ...over,
  };
}

const sends = (platform: { calls: Array<{ method: string; path: string; body?: unknown }> }, method: string, prefix: string) =>
  platform.calls.filter((c) => c.method === method && c.path.startsWith(prefix)).map((c) => c.body);

// Group headings are the h3 that sit beside a tab list.
const groupHeadings = () =>
  screen
    .getAllByRole('tablist')
    .map((l) => l.previousElementSibling)
    .filter((h): h is Element => h?.tagName === 'H3')
    .map((h) => h.textContent);

describe('grouping', () => {
  it('groups cabinets by room with the cabinets without a room last', async () => {
    renderShelves(world());
    await screen.findAllByRole('tab');
    expect(groupHeadings()).toEqual(['Cucina', 'Studio', 'Senza stanza']);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Credenza', 'Libreria', 'Ripostiglio']);
    expect(await screen.findByRole('heading', { level: 2, name: 'Credenza' })).toBeInTheDocument();
    expect(screen.getByText('Stanza: Cucina')).toBeInTheDocument();
  });

  it('shows no headings with a single group', async () => {
    renderShelves(world({ shelves: [shelf(1, { room_id: 'r1' }), shelf(2, { room_id: 'r1' })] }));
    await screen.findAllByRole('tab');
    expect(groupHeadings()).toEqual([]);
  });

  it('shows only the room named in the address', async () => {
    renderShelves(world(), '/shelves?room=r2');
    await screen.findAllByRole('tab');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Libreria']);
    expect(screen.getByText('Solo i mobili della stanza «Studio».')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mostra tutti' }));
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(3));
  });
});

describe('managing rooms', () => {
  it('lists, adds, renames, refuses a duplicate and deletes with confirmation', async () => {
    const w = world();
    const { platform } = renderShelves(w);
    await userEvent.click(await screen.findByRole('button', { name: 'Stanze…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Stanze' });
    const list = within(dialog).getByRole('list', { name: 'Stanze' });
    expect(within(list).getByText('Cucina')).toBeInTheDocument();
    expect(within(list).getAllByText('1 mobile')).toHaveLength(2);

    await userEvent.type(within(dialog).getByLabelText('Nome della nuova stanza'), 'Camera');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aggiungi' }));
    expect(await within(dialog).findByText('Camera')).toBeInTheDocument();
    expect(sends(platform, 'POST', '/api/v1/rooms')).toEqual([{ name: 'Camera' }]);

    await userEvent.type(within(dialog).getByLabelText('Nome della nuova stanza'), 'cucina');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aggiungi' }));
    expect(await within(dialog).findByText('Esiste già una stanza con questo nome')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Rinomina Camera' }));
    const input = within(dialog).getByLabelText('Nuovo nome di Camera');
    await userEvent.clear(input);
    await userEvent.type(input, 'Bagno');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    expect(await within(dialog).findByText('Bagno')).toBeInTheDocument();
    expect(sends(platform, 'PATCH', '/api/v1/rooms/')).toEqual([{ name: 'Bagno' }]);

    expect(within(dialog).getByRole('button', { name: 'Elimina Cucina' }).className).toContain('toneDanger');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Elimina Cucina' }));
    const confirm = await screen.findByRole('dialog', { name: 'Eliminare la stanza?' });
    expect(within(confirm).getByText(/restano, ma senza stanza/)).toBeInTheDocument();
    expect(sends(platform, 'DELETE', '/api/v1/rooms/')).toHaveLength(0);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Elimina' }));
    await waitFor(() => expect(within(dialog).queryByText('Cucina')).toBeNull());
    expect(sends(platform, 'DELETE', '/api/v1/rooms/')).toHaveLength(1);
  });

  it('rejects an empty name without a request', async () => {
    const { platform } = renderShelves(world());
    await userEvent.click(await screen.findByRole('button', { name: 'Stanze…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Stanze' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aggiungi' }));
    expect(await within(dialog).findByText('Campo obbligatorio')).toBeInTheDocument();
    expect(sends(platform, 'POST', '/api/v1/rooms')).toHaveLength(0);
  });
});

describe('room field', () => {
  const pick = async (dialog: HTMLElement, name: string) => {
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Stanza' }));
    await userEvent.click(await screen.findByRole('option', { name }));
  };

  it('chooses a room for a new cabinet', async () => {
    const { platform } = renderShelves(world());
    await userEvent.click(await screen.findByRole('button', { name: 'Nuovo mobile' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuovo mobile' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Dispensa');
    await pick(dialog, 'Cucina');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sends(platform, 'POST', '/api/v1/shelves')).toEqual([expect.objectContaining({ name: 'Dispensa', room_id: 'r1' })]);
  });

  it('sends room_id null when "Nessuna" is chosen', async () => {
    const { platform } = renderShelves(world());
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica Credenza' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifica mobile' });
    expect(within(dialog).getByRole('combobox', { name: 'Stanza' })).toHaveTextContent('Cucina');
    await pick(dialog, 'Nessuna');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sends(platform, 'PATCH', '/api/v1/shelves')).toEqual([{ room_id: null }]);
  });

  it('creates a room on the fly and shows a duplicate beside the field', async () => {
    const { platform } = renderShelves(world());
    await userEvent.click(await screen.findByRole('button', { name: 'Nuovo mobile' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuovo mobile' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Dispensa');
    await pick(dialog, 'Nuova stanza…');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    expect(await within(dialog).findByText('Campo obbligatorio')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Nome della nuova stanza'), 'studio');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    expect(await within(dialog).findByText('Esiste già una stanza con questo nome')).toBeInTheDocument();
    expect(sends(platform, 'POST', '/api/v1/shelves')).toHaveLength(0);
    await userEvent.clear(within(dialog).getByLabelText('Nome della nuova stanza'));
    await userEvent.type(within(dialog).getByLabelText('Nome della nuova stanza'), 'Garage');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sends(platform, 'POST', '/api/v1/rooms')).toEqual([{ name: 'studio' }, { name: 'Garage' }]);
    expect(sends(platform, 'POST', '/api/v1/shelves')).toEqual([expect.objectContaining({ room_id: 'rnew3' })]);
  });

  const newCabinet = async (name: string, roomName: string) => {
    await userEvent.click(await screen.findByRole('button', { name: 'Nuovo mobile' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuovo mobile' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), name);
    await pick(dialog, 'Nuova stanza…');
    await userEvent.type(within(dialog).getByLabelText('Nome della nuova stanza'), roomName);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    return dialog;
  };

  it('reuses the room made by a failed try instead of creating it twice', async () => {
    const w = world({ refuse: { method: 'POST', status: 500, code: 'internal' } });
    const { platform } = renderShelves(w);
    const dialog = await newCabinet('Dispensa', 'Garage');
    await waitFor(() => expect(sends(platform, 'POST', '/api/v1/rooms')).toHaveLength(1));
    expect(screen.getByRole('dialog', { name: 'Nuovo mobile' })).toBeInTheDocument();
    delete w.refuse;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sends(platform, 'POST', '/api/v1/rooms')).toEqual([{ name: 'Garage' }]);
    expect(sends(platform, 'POST', '/api/v1/shelves').at(-1)).toEqual(expect.objectContaining({ room_id: 'rnew3' }));
  });

  it('creates the room again after a rename instead of reusing the old one', async () => {
    const w = world();
    const { platform } = renderShelves(w);
    await newCabinet('Dispensa', 'Garage');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    w.rooms!.find((r) => r.id === 'rnew3')!.name = 'Box';
    await newCabinet('Armadio', 'Garage');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sends(platform, 'POST', '/api/v1/rooms')).toEqual([{ name: 'Garage' }, { name: 'Garage' }]);
    expect(sends(platform, 'POST', '/api/v1/shelves').at(-1)).toEqual(expect.objectContaining({ room_id: 'rnew4' }));
  });

  it('lifts the room filter when the new cabinet goes elsewhere', async () => {
    renderShelves(world(), '/shelves?room=r2');
    await screen.findAllByRole('tab');
    await userEvent.click(screen.getByRole('button', { name: 'Nuovo mobile' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuovo mobile' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Dispensa');
    await pick(dialog, 'Cucina');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(4));
    expect(screen.queryByText(/Solo i mobili della stanza/)).toBeNull();
  });
});

describe('without permission', () => {
  it('shows the room but no controls to change rooms', async () => {
    renderShelves(world({ role: 'guest' }));
    await screen.findAllByRole('tab');
    expect(screen.getByText('Stanza: Cucina')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stanze…' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nuovo mobile' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Modifica Credenza' })).toBeNull();
  });
});
