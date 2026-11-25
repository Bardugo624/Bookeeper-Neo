import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { book, loan, renderLoans, type Store } from './testkit';

const store = (): Store => ({
  loans: [loan(1, { borrower_name: 'Marta' }), loan(2, { borrower_name: 'Mario' }), loan(3, { borrower_name: 'Luca' })],
  books: [book(9)],
});

const suggestionCalls = (platform: { calls: Array<{ method: string; path: string }> }) =>
  platform.calls.filter((c) => c.path.startsWith('/api/v1/loans/borrowers'));

async function openForm() {
  const user = userEvent.setup();
  const r = renderLoans(store(), '/loans?new=1');
  const input = await screen.findByRole('combobox', { name: 'A chi' });
  return { user, input, ...r };
}

describe('borrower suggestions', () => {
  it('asks after the delay and lists the matching names', async () => {
    const { user, input, platform } = await openForm();
    await user.click(input);
    await user.type(input, 'Mar');
    expect(await screen.findByRole('listbox', { name: 'Nomi già usati' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Marta', 'Mario']));
    expect(suggestionCalls(platform).some((c) => c.path.includes('q=Mar'))).toBe(true);
    // not one request per key stroke
    expect(suggestionCalls(platform).some((c) => c.path.includes('q=Ma&') || c.path.endsWith('q=Ma'))).toBe(false);
  });

  it('moves with the arrows and picks with Enter without submitting', async () => {
    const { user, input, platform } = await openForm();
    await user.type(input, 'Mar');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]!.id);
    await user.keyboard('{Enter}');
    expect(input).toHaveValue('Mario');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(platform.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('picks with the pointer', async () => {
    const { user, input } = await openForm();
    await user.type(input, 'Lu');
    await user.click(await screen.findByRole('option', { name: 'Luca' }));
    expect(input).toHaveValue('Luca');
  });

  it('accepts a new name and shows no list when nothing matches', async () => {
    const { user, input } = await openForm();
    await user.type(input, 'Zeno');
    await waitFor(() => expect(input).toHaveValue('Zeno'));
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
});
