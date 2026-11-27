import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { toUnixSeconds } from '../../kit';
import { DAY, book, loan, renderLoans, writes, type Store } from './testkit';

const store = (over: Partial<Store> = {}): Store => ({
  loans: [loan(1, { due_at: 1_700_000_000 + 30 * DAY }), loan(3, { returned_at: 1_700_100_000 })],
  books: [book(4), book(5, { title: 'Dune' })],
  ...over,
});

const dialog = () => screen.getByRole('dialog');

async function fillNew(user: ReturnType<typeof userEvent.setup>, name = 'Marco') {
  await user.click(await screen.findByRole('button', { name: 'Nuovo prestito' }));
  await user.type(within(dialog()).getByRole('searchbox'), 'Dune');
  await user.click(await within(dialog()).findByRole('button', { name: /Dune/ }));
  await user.type(within(dialog()).getByLabelText('A chi'), name);
}

describe('new loan', () => {
  it('validates before sending anything', async () => {
    const user = userEvent.setup();
    const { platform } = renderLoans(store());
    await user.click(await screen.findByRole('button', { name: 'Nuovo prestito' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Presta' }));
    expect(within(dialog()).getByText('Scegli un libro.')).toBeInTheDocument();
    expect(within(dialog()).getByText('Scrivi a chi presti il libro.')).toBeInTheDocument();
    expect(writes(platform)).toHaveLength(0);
  });

  it('refuses a due date before the lending date', async () => {
    const user = userEvent.setup();
    const { platform } = renderLoans(store());
    await fillNew(user);
    const d = dialog();
    await user.clear(within(d).getByLabelText('Data del prestito'));
    await user.type(within(d).getByLabelText('Data del prestito'), '2025-03-10');
    await user.type(within(d).getByLabelText(/Scadenza/), '2025-03-09');
    await user.click(within(d).getByRole('button', { name: 'Presta' }));
    expect(within(d).getByText('La scadenza non può essere prima della data del prestito.')).toBeInTheDocument();
    expect(writes(platform)).toHaveLength(0);
  });

  it('sends the body, closes and refreshes loans and books', async () => {
    const user = userEvent.setup();
    const { platform } = renderLoans(store());
    await screen.findByText('Libro 1');
    await fillNew(user, ' Marco ');
    const d = dialog();
    await user.clear(within(d).getByLabelText('Data del prestito'));
    await user.type(within(d).getByLabelText('Data del prestito'), '2025-03-10');
    await user.type(within(d).getByLabelText(/Scadenza/), '2025-03-24');
    await user.type(within(d).getByLabelText('Note'), 'Con la sovraccoperta');
    const before = platform.calls.length;
    await user.click(within(d).getByRole('button', { name: 'Presta' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(platform)).toHaveLength(1);
    expect(writes(platform)[0]).toMatchObject({
      method: 'POST',
      path: '/api/v1/loans',
      body: {
        book_id: 'b5',
        borrower_name: 'Marco',
        lent_at: toUnixSeconds('2025-03-10'),
        due_at: toUnixSeconds('2025-03-24'),
        notes: 'Con la sovraccoperta',
      },
    });
    // The list and the loan counts are asked again after the write.
    await waitFor(() => {
      const after = platform.calls.slice(before).filter((c) => c.method === 'GET');
      expect(after.some((c) => c.path.startsWith('/api/v1/loans?') && c.path.includes('limit=50'))).toBe(true);
      expect(after.some((c) => c.path.includes('limit=1'))).toBe(true);
    });
    await screen.findByText('A Marco');
  });

  it('shows the dedicated message when the book is already lent and keeps the form', async () => {
    const user = userEvent.setup();
    const s = store();
    const { platform } = renderLoans(s);
    await fillNew(user);
    s.failNext = { status: 409, code: 'book_already_lent' };
    await user.click(within(dialog()).getByRole('button', { name: 'Presta' }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Questo libro è già in prestito');
    expect(within(dialog()).getByLabelText('A chi')).toHaveValue('Marco');
    expect(writes(platform)).toHaveLength(1);
  });
});

describe('return, reopen, edit, delete', () => {
  it('marks as returned with a date, today by default', async () => {
    const user = userEvent.setup();
    const { platform } = renderLoans(store());
    await user.click(await screen.findByRole('button', { name: 'Segna come restituito' }));
    const d = dialog();
    const date = within(d).getByLabelText('Data di restituzione') as HTMLInputElement;
    expect(date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await user.clear(date);
    await user.type(date, '2030-01-15');
    await user.click(within(d).getByRole('button', { name: 'Segna come restituito' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(platform)[0]).toMatchObject({
      method: 'POST',
      path: '/api/v1/loans/l1/return',
      body: { returned_at: toUnixSeconds('2030-01-15') },
    });
    await waitFor(() => expect(screen.queryByText('Libro 1')).toBeNull());
  });

  it('refuses a return before the lending date', async () => {
    const user = userEvent.setup();
    const { platform } = renderLoans(store());
    await user.click(await screen.findByRole('button', { name: 'Segna come restituito' }));
    const date = within(dialog()).getByLabelText('Data di restituzione');
    await user.clear(date);
    await user.type(date, '2000-01-01');
    await user.click(within(dialog()).getByRole('button', { name: 'Segna come restituito' }));
    expect(within(dialog()).getByText('La restituzione non può essere prima del prestito.')).toBeInTheDocument();
    expect(writes(platform)).toHaveLength(0);
  });

  it('reopens a returned loan', async () => {
    const user = userEvent.setup();
    const { platform } = renderLoans(store(), '/loans?filter=returned');
    await user.click(await screen.findByRole('button', { name: 'Riapri' }));
    await waitFor(() => expect(writes(platform)).toHaveLength(1));
    expect(writes(platform)[0]).toMatchObject({ method: 'POST', path: '/api/v1/loans/l3/reopen' });
    await screen.findByText('Nessun prestito restituito');
  });

  it('says why a loan cannot be reopened', async () => {
    const user = userEvent.setup();
    const s = store();
    renderLoans(s, '/loans?filter=returned');
    const button = await screen.findByRole('button', { name: 'Riapri' });
    s.failNext = { status: 409, code: 'book_already_lent' };
    await user.click(button);
    expect(await screen.findByText(/già in prestito a qualcun altro/)).toBeInTheDocument();
  });

  it('edits a loan and clears the due date with null', async () => {
    const user = userEvent.setup();
    const { platform } = renderLoans(store());
    await user.click(await screen.findByRole('button', { name: 'Modifica' }));
    const d = dialog();
    expect(within(d).queryByRole('searchbox')).toBeNull();
    const name = within(d).getByLabelText('A chi');
    expect(name).toHaveValue('Persona 1');
    await user.clear(name);
    await user.type(name, 'Giulia');
    await user.clear(within(d).getByLabelText(/Scadenza/));
    await user.click(within(d).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(platform)[0]).toMatchObject({
      method: 'PATCH',
      path: '/api/v1/loans/l1',
      body: { borrower_name: 'Giulia', due_at: null, notes: null },
    });
    await screen.findByText('A Giulia');
  });

  it('changes the person of a loan, and a free name takes the link off', async () => {
    const user = userEvent.setup();
    const s = store({
      people: [{ id: 'u2', display_name: 'Marta' }],
      loans: [loan(1, { borrower_name: 'Luca' })],
    });
    const { platform } = renderLoans(s);
    await user.click(await screen.findByRole('button', { name: 'Modifica' }));
    const name = within(dialog()).getByLabelText('A chi');
    await user.clear(name);
    await user.click(await screen.findByRole('option', { name: 'Marta' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(platform)[0]!.body).toMatchObject({ borrower_user_id: 'u2' });
    expect(writes(platform)[0]!.body).not.toHaveProperty('borrower_name');
    await user.click(await screen.findByRole('button', { name: 'Modifica' }));
    const again = within(dialog()).getByLabelText('A chi');
    await user.type(again, 'x');
    await user.click(within(dialog()).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(writes(platform)).toHaveLength(2));
    expect(writes(platform)[1]!.body).toMatchObject({ borrower_name: 'Martax', borrower_user_id: null });
  });

  it('asks for confirmation before deleting and names the loan', async () => {
    const user = userEvent.setup();
    const { platform } = renderLoans(store());
    const command = (await screen.findAllByRole('button', { name: 'Elimina' }))[0]!;
    expect(command.className).not.toContain('toneDanger');
    expect(command.parentElement!.querySelector(':scope > span')).toBeNull();
    await user.click(screen.getAllByRole('button', { name: 'Elimina' })[0]!);
    expect(dialog()).toHaveTextContent('Il prestito di «Libro 1» a Persona 1');
    expect(dialog()).toHaveTextContent('dallo storico. L\'operazione non si può annullare.');
    expect(screen.getAllByRole('button', { name: 'Elimina' })[0]).not.toHaveAttribute('title');
    expect(within(dialog()).getByRole('button', { name: 'Elimina' }).className).toMatch(/danger/i);
    await user.click(within(dialog()).getByRole('button', { name: 'Annulla' }));
    expect(writes(platform)).toHaveLength(0);
    await user.click(screen.getAllByRole('button', { name: 'Elimina' })[0]!);
    await user.click(within(dialog()).getByRole('button', { name: 'Elimina' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(platform)[0]).toMatchObject({ method: 'DELETE', path: '/api/v1/loans/l1' });
    await screen.findByText('Nessun prestito in corso');
  });
});
