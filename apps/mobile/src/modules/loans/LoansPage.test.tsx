import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DAY, isReturn, loan, now, person, renderLoans } from './testkit';

const rows = () => within(screen.getByRole('list', { name: 'Prestiti' })).getAllByRole('listitem');

describe('loans list', () => {
  it('puts the late loans first, with how long they are late', async () => {
    renderLoans({
      loans: [
        loan(1, { due_at: now() + 5 * DAY }),
        loan(2, { due_at: now() - 3 * DAY - 60, overdue: true }),
        loan(3),
        loan(4, { due_at: now() - 1 * DAY - 60, overdue: true }),
      ],
    });
    await screen.findByRole('list', { name: 'Prestiti' });
    expect(rows().map((r) => within(r).getByText(/^Libro \d$/).textContent)).toEqual(['Libro 2', 'Libro 4', 'Libro 1', 'Libro 3']);
    expect(within(rows()[0]!).getByText('scaduto da 3 giorni')).toBeInTheDocument();
    expect(within(rows()[1]!).getByText('scaduto da 1 giorno')).toBeInTheDocument();
    expect(within(rows()[3]!).getByText('senza scadenza')).toBeInTheDocument();
  });

  it('shows a member with an icon, by the name the server gives', async () => {
    renderLoans({
      loans: [loan(1, { borrower_name: 'vecchio', borrower: { id: 'u2', display_name: 'Marco' }, borrower_user_id: 'u2' }), loan(2)],
    });
    await screen.findByRole('list', { name: 'Prestiti' });
    const [member, free] = rows();
    expect(within(member!).getByText('Marco')).toBeInTheDocument();
    expect(member!.querySelector('svg')).not.toBeNull();
    expect(within(free!).getByText('Persona 2')).toBeInTheDocument();
    expect(within(free!).queryByText('Marco')).toBeNull();
    expect(within(member!).getByRole('link')).toHaveAttribute('href', '/books/b1');
  });

  it('lists the returned ones, the latest first', async () => {
    renderLoans({
      loans: [loan(1, { returned_at: now() - 5 * DAY }), loan(2, { returned_at: now() - DAY }), loan(3)],
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Restituiti' }));
    await screen.findByText('Libro 2');
    expect(rows().map((r) => within(r).getByText(/^Libro \d$/).textContent)).toEqual(['Libro 2', 'Libro 1']);
    expect(screen.queryByRole('button', { name: /^Restituisci/ })).toBeNull();
  });

  it('says so when nothing is lent', async () => {
    renderLoans({ loans: [] });
    expect(await screen.findByText('Nessun prestito in corso')).toBeInTheDocument();
  });

  it('is a tab after "Scansiona"', async () => {
    renderLoans({});
    const nav = await screen.findByRole('navigation');
    expect(within(nav).getByRole('link', { name: 'Prestiti' })).toHaveAttribute('aria-current', 'page');
  });

  it('returns a loan after a confirmation', async () => {
    const { platform } = renderLoans({ loans: [loan(1), loan(2)], people: [person('u2', 'Marco')] });
    await userEvent.click(await screen.findByRole('button', { name: 'Restituisci «Libro 1»' }));
    const sheet = await screen.findByRole('dialog');
    expect(platform.fake.calls.some(isReturn)).toBe(false);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Restituisci' }));
    await screen.findByRole('list', { name: 'Prestiti' });
    const call = platform.fake.calls.find(isReturn);
    expect(call?.path).toBe('/api/v1/loans/l1/return');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not return when the sheet is cancelled', async () => {
    const { platform } = renderLoans({ loans: [loan(1)] });
    await userEvent.click(await screen.findByRole('button', { name: 'Restituisci «Libro 1»' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Annulla' }));
    expect(platform.fake.calls.some(isReturn)).toBe(false);
  });

  it('offers no return to a guest', async () => {
    renderLoans({ loans: [loan(1)], role: 'guest' });
    await screen.findByRole('list', { name: 'Prestiti' });
    expect(screen.queryByRole('button', { name: /^Restituisci/ })).toBeNull();
  });
});
