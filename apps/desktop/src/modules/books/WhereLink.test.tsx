import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { book, installIntersectionObserver, renderBooks } from './testkit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});

const placed = book(1, { placement: { shelf_id: 's1', row_index: 1, slot_index: 3 } });
const loose = book(2);

describe('"Dov\'è?" in the list', () => {
  it('is offered on the cards of placed books only, and goes to the unit with the book', async () => {
    const { router } = renderBooks({ books: [placed, loose] });
    await screen.findByRole('link', { name: 'Libro 2 Autore 2' });
    expect(screen.getAllByRole('link', { name: /^Dov'è/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole('link', { name: 'Dov\'è «Libro 1»?' }));
    expect(router.state.location.pathname).toBe('/shelves');
    expect(router.state.location.search).toBe('?unit=s1&book=b1');
  });

  it('is offered in the table rows of placed books only', async () => {
    const { router } = renderBooks({ books: [placed, loose] }, '/books?view=list');
    const table = await screen.findByRole('table', { name: 'Libri' });
    expect(within(table).getAllByRole('link', { name: /^Dov'è/ })).toHaveLength(1);
    await userEvent.click(within(table).getByRole('link', { name: 'Dov\'è «Libro 1»?' }));
    expect(router.state.location.search).toBe('?unit=s1&book=b1');
  });
});
