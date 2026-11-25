import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { loan, renderLoans, type Store } from './testkit';

const at = (y: number, m: number, d: number) => Math.floor(new Date(y, m - 1, d, 12).getTime() / 1000);

const store = (over: Partial<Store> = {}): Store => ({
  loans: [
    loan(1, { borrower_name: 'Anna', lent_at: at(2024, 1, 1), due_at: at(2024, 1, 10), returned_at: at(2024, 1, 15) }),
    loan(2, { borrower_name: 'anna', lent_at: at(2024, 2, 1), returned_at: at(2024, 3, 2) }),
    loan(3, { borrower_name: 'Bruno', lent_at: at(2024, 3, 1), returned_at: at(2024, 3, 11) }),
    loan(4, { borrower_name: 'Anna' }),
    loan(5, { borrower_name: 'Carla' }),
  ],
  books: [],
  ...over,
});

describe('history', () => {
  it('groups by month of return, with duration and delay', async () => {
    renderLoans(store(), '/loans?filter=returned');
    await screen.findByText('Libro 1');
    const headings = screen.getAllByRole('heading', { level: 2 }).filter((h) => h.id.startsWith('loan-month'));
    expect(headings).toHaveLength(2);
    expect(headings[0]).toHaveTextContent(/marzo 2024/i);
    expect(headings[1]).toHaveTextContent(/gennaio 2024/i);
    const jan = screen.getByRole('list', { name: /Prestiti restituiti, gennaio 2024/i });
    expect(within(jan).getByText('durata 14 g · 5 g di ritardo')).toBeInTheDocument();
    const mar = screen.getByRole('list', { name: /marzo 2024/i });
    expect(within(mar).getAllByRole('listitem')).toHaveLength(2);
  });

  it('summarizes closed loans, average length and top person', async () => {
    renderLoans(store(), '/loans?filter=returned');
    await screen.findByText('Libro 1');
    const summary = screen.getByLabelText('Riepilogo');
    expect(within(summary).getByText('3')).toBeInTheDocument();
    // (14 + 30 + 10) / 3 = 18
    expect(within(summary).getByText('18 g')).toBeInTheDocument();
    expect(within(summary).getByText('Anna (2)')).toBeInTheDocument();
  });

  it('searches by person or title over the loaded loans', async () => {
    const user = userEvent.setup();
    renderLoans(store(), '/loans?filter=returned');
    await screen.findByText('Libro 1');
    await user.type(screen.getByRole('searchbox', { name: 'Cerca per persona o titolo' }), 'bru');
    expect(screen.queryByText('Libro 1')).toBeNull();
    expect(screen.getByText('Libro 3')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Cerca per persona o titolo' }), 'zzz');
    expect(screen.getByText('Nessun prestito corrisponde alla ricerca.')).toBeInTheDocument();
  });

  it('shows the empty state with no closed loan', async () => {
    renderLoans(store({ loans: [loan(4)] }), '/loans?filter=returned');
    expect(await screen.findByText('Nessun prestito restituito')).toBeInTheDocument();
  });
});

describe('per person', () => {
  it('filters from the address without regard to case, open and closed', async () => {
    renderLoans(store(), '/loans?filter=all&borrower=ANNA');
    await screen.findByText('Libro 1');
    expect(screen.getAllByRole('listitem').filter((li) => li.matches('li[data-status]'))).toHaveLength(3);
    expect(screen.queryByText('Libro 3')).toBeNull();
    expect(screen.queryByText('Libro 5')).toBeNull();
  });

  it('filters by touching a name and clears', async () => {
    const user = userEvent.setup();
    const { router } = renderLoans(store());
    await screen.findByText('Libro 5');
    await user.click(screen.getByRole('button', { name: 'Mostra i prestiti di Carla' }));
    expect(router.state.location.search).toBe('?borrower=Carla');
    await screen.findByText('Solo i prestiti a Carla.');
    expect(screen.queryByText('Libro 4')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Mostra tutti' }));
    await screen.findByText('Libro 4');
    expect(router.state.location.search).toBe('');
  });
});

describe('new loan from the address', () => {
  it('opens the dialog with ?new=1 and removes the parameter', async () => {
    const { router } = renderLoans(store(), '/loans?new=1');
    expect(await screen.findByRole('dialog', { name: 'Nuovo prestito' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
  });
});
