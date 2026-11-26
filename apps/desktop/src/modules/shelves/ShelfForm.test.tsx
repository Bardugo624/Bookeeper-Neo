import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { book, renderShelves, shelf, type World } from './testkit';

function world(over: Partial<World> = {}): World {
  return {
    shelves: [shelf(1, { name: 'Salotto', color: 'night' })],
    books: [book('b1'), book('b2')],
    spots: { b1: { shelf: 's1', row: 0, slot: 0 }, b2: { shelf: 's1', row: 0, slot: 1 } },
    ...over,
  };
}

const body = (platform: { calls: Array<{ method: string; path: string; body?: unknown }> }, method: string) =>
  platform.calls.find((c) => c.method === method && c.path.startsWith('/api/v1/shelves'))?.body;

describe('new cabinet', () => {
  it('validates with the limits of the core and sends the body', async () => {
    const w = world();
    const { platform } = renderShelves(w);
    await userEvent.click(await screen.findByRole('button', { name: 'Nuovo mobile' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuovo mobile' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    expect(await within(dialog).findByText('Campo obbligatorio')).toBeInTheDocument();
    expect(body(platform, 'POST')).toBeUndefined();

    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Studio');
    await userEvent.clear(within(dialog).getByLabelText('Numero di ripiani'));
    await userEvent.type(within(dialog).getByLabelText('Numero di ripiani'), '13');
    await userEvent.clear(within(dialog).getByLabelText('Posti per ripiano'));
    await userEvent.type(within(dialog).getByLabelText('Posti per ripiano'), '4');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    expect(await within(dialog).findByText('Da 1 a 12 ripiani')).toBeInTheDocument();
    expect(within(dialog).getByText('Da 5 a 60 posti')).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText('Numero di ripiani'));
    await userEvent.type(within(dialog).getByLabelText('Numero di ripiani'), '5');
    await userEvent.clear(within(dialog).getByLabelText('Posti per ripiano'));
    await userEvent.type(within(dialog).getByLabelText('Posti per ripiano'), '30');
    const sage = within(dialog).getByRole('radio', { name: 'Salvia' });
    expect(sage).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Prugna' }));
    expect(within(dialog).getByRole('radio', { name: 'Prugna' })).toHaveAttribute('aria-checked', 'true');
    expect(sage).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(body(platform, 'POST')).toEqual({ name: 'Studio', color: 'plum', rows: 5, slots_per_row: 30 });
    // The address that opens the new cabinet changes in a transition, a frame after the dialog closes.
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Studio' })).toHaveAttribute('aria-selected', 'true'));
  });

  it('moves the colour choice with the arrow keys', async () => {
    renderShelves(world());
    await userEvent.click(await screen.findByRole('button', { name: 'Nuovo mobile' }));
    const dialog = await screen.findByRole('dialog');
    within(dialog).getByRole('radio', { name: 'Salvia' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'Terracotta' })).toHaveFocus());
    expect(within(dialog).getByRole('radio', { name: 'Terracotta' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('edit cabinet', () => {
  it('starts from the current values and sends only what changed', async () => {
    const w = world();
    const { platform } = renderShelves(w);
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica Salotto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifica mobile' });
    expect(within(dialog).getByLabelText('Nome')).toHaveValue('Salotto');
    expect(within(dialog).getByRole('radio', { name: 'Notte' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.clear(within(dialog).getByLabelText('Nome'));
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Studio');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(body(platform, 'PATCH')).toEqual({ name: 'Studio' });
    expect(await screen.findByRole('tab', { name: 'Studio' })).toBeInTheDocument();
  });

  it('shows the core refusing to shrink a cabinet below its books', async () => {
    renderShelves(world({ refuse: { method: 'PATCH', status: 409, code: 'shelf_too_small' } }));
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica Salotto' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.clear(within(dialog).getByLabelText('Numero di ripiani'));
    await userEvent.type(within(dialog).getByLabelText('Numero di ripiani'), '1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    expect(await within(dialog).findByText(/Un libro collocato resterebbe fuori dal mobile/)).toBeInTheDocument();
  });
});

describe('delete cabinet', () => {
  it('asks first and says the placed books stay, unplaced', async () => {
    const w = world({ shelves: [shelf(1, { name: 'Salotto' }), shelf(2, { name: 'Studio' })] });
    const { platform } = renderShelves(w);
    await userEvent.click(await screen.findByRole('button', { name: 'Elimina Salotto' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Il mobile «Salotto» sarà eliminato. I 2 libri collocati restano in biblioteca, ma risultano non collocati.');
    expect(platform.calls.some((c) => c.method === 'DELETE')).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Elimina' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(platform.calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual(['/api/v1/shelves/s1']);
    expect(await screen.findByRole('tab', { name: 'Studio' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Salotto' })).toBeNull();
    expect(await screen.findByText('Libro b1')).toBeInTheDocument();
  });

  it('shows the error when the core refuses', async () => {
    renderShelves(world({ refuse: { method: 'DELETE', status: 403, code: 'forbidden' } }));
    await screen.findByRole('button', { name: 'Elimina Salotto' });
    await userEvent.click(screen.getByRole('button', { name: 'Elimina Salotto' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Elimina' }));
    expect(await screen.findByText('Non hai i permessi per eseguire questa operazione.')).toBeInTheDocument();
  });
});

describe('english', () => {
  it('speaks english', async () => {
    renderShelves(world(), '/shelves', 'en');
    expect(await screen.findByText('1 cabinet · 2 books placed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New cabinet' })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Shelf 1' })).toBeInTheDocument();
  });
});
