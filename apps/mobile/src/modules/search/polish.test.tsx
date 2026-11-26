import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { book, renderSearch } from './testkit';

describe('polish of search, card and "where"', () => {
  it('names a row by its visible text: no aria-label, loan tag inside the name', async () => {
    renderSearch({ api: { books: [book(1, { on_loan: true })] } });
    const row = await screen.findByRole('link', { name: /^Libro 1 Autore 1 In prestito$/ });
    expect(row).not.toHaveAttribute('aria-label');
    expect(row).not.toHaveAttribute('aria-describedby');
  });

  it('keeps the placement phrase together: label and number never split', async () => {
    renderSearch({
      api: {
        books: [book(1, { placement: { shelf_id: 's1', row_index: 0, slot_index: 0 } })],
        shelves: [{ id: 's1', name: 'Libreria grande' }],
      },
      route: '/books/b1',
    });
    const phrase = await screen.findByText(/Libreria grande/);
    expect(phrase.textContent).toBe('Libreria grande · ripiano 1 · posto 1');
  });

  it('shows the fade on the quick filters only when more chips wait past the edge', async () => {
    const proto = HTMLElement.prototype;
    const sw = Object.getOwnPropertyDescriptor(proto, 'scrollWidth');
    const cw = Object.getOwnPropertyDescriptor(proto, 'clientWidth');
    Object.defineProperty(proto, 'scrollWidth', { configurable: true, get: () => 600 });
    Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => 300 });
    try {
      renderSearch({ api: { books: [book(1)] } });
      const bar = await screen.findByRole('group', { name: 'Filtra i libri' });
      await vi.waitFor(() => expect(bar).toHaveAttribute('data-more', 'true'));
    } finally {
      if (sw) Object.defineProperty(proto, 'scrollWidth', sw);
      else delete (proto as unknown as Record<string, unknown>).scrollWidth;
      if (cw) Object.defineProperty(proto, 'clientWidth', cw);
      else delete (proto as unknown as Record<string, unknown>).clientWidth;
    }
  });

  it('has no fade when everything fits', async () => {
    renderSearch({ api: { books: [book(1)] } });
    const bar = await screen.findByRole('group', { name: 'Filtra i libri' });
    expect(bar).not.toHaveAttribute('data-more');
  });
});

