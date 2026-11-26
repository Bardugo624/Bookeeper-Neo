import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installIntersectionObserver } from './testkit';
import { openGroup, openNewBook, renderWithWrites } from './writeKit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});
afterEach(() => vi.restoreAllMocks());

const group = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('BookSheet folded groups', () => {
  it('does not reopen another group or move the focus when an error goes away while typing', async () => {
    renderWithWrites({ books: [] });
    await openNewBook();
    await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Titolo' }), 'Dune');
    await openGroup('Edizione');
    await userEvent.type(screen.getByRole('textbox', { name: 'Pagine' }), '0');
    await openGroup('Raccolta');
    await userEvent.type(screen.getByRole('textbox', { name: 'Prezzo (€)' }), 'abc');
    await userEvent.click(group('Edizione'));
    await userEvent.click(group('Raccolta'));
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(group('Edizione')).toHaveAttribute('aria-expanded', 'true'));
    expect(group('Raccolta')).toHaveAttribute('aria-expanded', 'true');
    // The person folds the second group again and fixes the first field.
    await userEvent.click(group('Raccolta'));
    const pages = screen.getByRole('textbox', { name: 'Pagine' });
    await userEvent.clear(pages);
    await userEvent.type(pages, '12');
    expect(group('Raccolta')).toHaveAttribute('aria-expanded', 'false');
    expect(pages).toHaveFocus();
  });
});
