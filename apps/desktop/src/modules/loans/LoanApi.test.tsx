import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { AppModule } from '../../app';
import { LendDialog, useActiveLoan } from './index';
import { book, loan, renderLoans, writes } from './testkit';

let bookFetches = 0;

function Probe({ id }: { id: string }) {
  // Stands for the book page: its query lives under the `books` key of the connection.
  useQuery({ queryKey: ['books', 'c1', 'detail', id], queryFn: async () => ++bookFetches });
  const { loan: active, isPending } = useActiveLoan(id);
  const [open, setOpen] = useState(false);
  if (isPending) return <p>caricamento</p>;
  return (
    <div>
      <p>{active ? `In prestito a ${active.borrower_name}` : 'Libero'}</p>
      <button onClick={() => setOpen(true)}>Presta</button>
      <LendDialog book={{ id, title: 'Dune' }} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

const probe = (id: string): AppModule => ({ id: 'probe', routes: [{ path: '/probe', element: <Probe id={id} /> }] });

describe('useActiveLoan', () => {
  it('finds the open loan of a lent book', async () => {
    const { platform } = renderLoans({ loans: [loan(1)], books: [] }, '/probe', [probe('b1')]);
    expect(await screen.findByText('In prestito a Persona 1')).toBeInTheDocument();
    const call = platform.calls.find((c) => c.path.startsWith('/api/v1/loans?'))!;
    const q = new URL(call.path, 'http://x').searchParams;
    expect(q.get('book_id')).toBe('b1');
    expect(q.get('status')).toBe('active');
  });

  it('answers free for a book with no open loan', async () => {
    renderLoans({ loans: [loan(1, { returned_at: 5 })], books: [] }, '/probe', [probe('b1')]);
    expect(await screen.findByText('Libero')).toBeInTheDocument();
  });
});

describe('LendDialog', () => {
  it('has the book fixed: no book choice, and the loan goes out with its id', async () => {
    const user = userEvent.setup();
    const { platform } = renderLoans({ loans: [], books: [book(9)] }, '/probe', [probe('b9')]);
    await user.click(await screen.findByRole('button', { name: 'Presta' }));
    const d = screen.getByRole('dialog', { name: 'Nuovo prestito' });
    expect(within(d).queryByRole('searchbox')).toBeNull();
    expect(within(d).queryByText('Libro')).toBeNull();
    expect(d).toHaveTextContent('Libro: Dune');
    await user.type(within(d).getByLabelText('A chi'), 'Elena');
    await user.click(within(d).getByRole('button', { name: 'Presta' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes(platform)[0]).toMatchObject({ method: 'POST', body: { book_id: 'b9', borrower_name: 'Elena' } });
    // The book's own query is refreshed too, and the book page now sees the loan.
    await waitFor(() => expect(bookFetches).toBeGreaterThan(1));
    expect(await screen.findByText('In prestito a Elena')).toBeInTheDocument();
  });

  it('renders nothing while closed', async () => {
    renderLoans({ loans: [], books: [] }, '/probe', [probe('b1')]);
    await screen.findByText('Libero');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
