import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { book } from '../search/testkit';
import { isLend, isReturn, loan, person, renderLoans } from './testkit';

const free = book(1, { id: 'b1' });
const lent = book(2, { id: 'b2', on_loan: true });

async function openLend(server = {}) {
  const r = renderLoans({ books: [free], people: [person('u1', 'Anna', { is_me: true }), person('u2', 'Marco')], names: ['Zia Rosa'], ...server }, '/books/b1');
  await userEvent.click(await screen.findByRole('button', { name: 'Presta' }));
  return { ...r, sheet: await screen.findByRole('dialog') };
}

describe('book page loan block', () => {
  it('lends to a person of the library', async () => {
    const { platform, sheet } = await openLend();
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Marco' }));
    await userEvent.type(within(sheet).getByLabelText(/^Nota/), 'Con la sovraccoperta');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Presta' }));
    await screen.findByText('Non in prestito');
    expect(platform.fake.calls.find(isLend)?.body).toEqual({ book_id: 'b1', borrower_user_id: 'u2', notes: 'Con la sovraccoperta' });
    expect(within(sheet).queryByRole('button', { name: 'Anna' })).toBeNull();
  });

  it('lends to a free name, with a due date', async () => {
    const { platform, sheet } = await openLend();
    await userEvent.type(within(sheet).getByLabelText('Nome'), '  Giulia ');
    const due = new Date(Date.now() + 10 * 86_400_000);
    const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    await userEvent.type(within(sheet).getByLabelText(/^Scadenza/), iso);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Presta' }));
    await screen.findByText('Non in prestito');
    const body = platform.fake.calls.find(isLend)?.body as Record<string, unknown>;
    expect(body.borrower_name).toBe('Giulia');
    expect(body.borrower_user_id).toBeUndefined();
    expect(typeof body.due_at).toBe('number');
  });

  it('takes a name used before', async () => {
    const { platform, sheet } = await openLend();
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Zia Rosa' }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Presta' }));
    await screen.findByText('Non in prestito');
    expect((platform.fake.calls.find(isLend)?.body as { borrower_name: string }).borrower_name).toBe('Zia Rosa');
  });

  it('asks for a person or a name before sending', async () => {
    const { platform, sheet } = await openLend();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Presta' }));
    expect(await within(sheet).findByText('Scegli una persona o scrivi un nome.')).toBeInTheDocument();
    expect(platform.fake.calls.some(isLend)).toBe(false);
  });

  it('returns a lent book after a confirmation', async () => {
    const { platform } = renderLoans({ books: [lent], loans: [loan(2, { borrower_name: 'Giulia' })] }, '/books/b2');
    expect(await screen.findByText('In prestito a Giulia')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Restituisci' }));
    const sheet = await screen.findByRole('dialog');
    expect(platform.fake.calls.some(isReturn)).toBe(false);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Restituisci' }));
    await screen.findByRole('region', { name: 'Prestito' });
    expect(platform.fake.calls.find(isReturn)?.path).toBe('/api/v1/loans/l2/return');
  });

  it('shows no command to a guest', async () => {
    renderLoans({ books: [free], role: 'guest' }, '/books/b1');
    const region = await screen.findByRole('region', { name: 'Prestito' });
    expect(within(region).queryByRole('button')).toBeNull();
  });
});
