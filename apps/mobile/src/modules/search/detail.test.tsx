import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookOut } from '@bookeeper/api';
import { book, renderSearch } from './testkit';

afterEach(() => vi.restoreAllMocks());

const placed = { shelf_id: 's1', row_index: 1, slot_index: 3 };
const shelves = [{ id: 's1', name: 'Libreria del salotto' }];

function open(b: BookOut, route = `/books/${b.id}`) {
  return renderSearch({ api: { books: [b], shelves }, route });
}

describe('book page', () => {
  it('puts where the book is first: furniture and shelf', async () => {
    open(book(1, { placement: placed }));
    const where = await screen.findByRole('region', { name: 'Dove si trova' });
    expect(await within(where).findByText(/^Libreria del salotto · /)).toBeInTheDocument();
    expect(within(where).getByText('Libreria del salotto · ripiano 2 · posto 4')).toBeInTheDocument();
    // First block after the title and authors.
    const regions = screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'));
    expect(regions[1]).toBe('where-title');
  });

  it('offers "Dov\'è?" only for a shelved book, going to its page', async () => {
    open(book(1, { placement: placed }));
    const where = await screen.findByRole('region', { name: 'Dove si trova' });
    expect(within(where).getByRole('link', { name: "Dov'è?" })).toHaveAttribute('href', '/books/b1/where');
  });

  it('says so when the book is not shelved', async () => {
    open(book(1));
    const where = await screen.findByRole('region', { name: 'Dove si trova' });
    expect(within(where).getByText('Non collocato')).toBeInTheDocument();
    expect(within(where).queryByRole('link', { name: "Dov'è?" })).toBeNull();
  });

  it('shows the title in the serif heading and the authors', async () => {
    open(book(1, { title: 'Dune', authors: ['Frank Herbert', 'Brian Herbert'] }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Dune' })).toBeInTheDocument();
    expect(screen.getByText('Frank Herbert, Brian Herbert')).toBeInTheDocument();
  });

  it('tells whether the book is on loan', async () => {
    const lent = open(book(1, { on_loan: true }));
    expect(within(await screen.findByRole('region', { name: 'Prestito' })).getByText('In prestito')).toBeInTheDocument();
    lent.unmount();
    open(book(2));
    expect(within(await screen.findByRole('region', { name: 'Prestito' })).getByText('Non in prestito')).toBeInTheDocument();
  });

  it('shows only the details that exist', async () => {
    open(book(1, { publisher: 'Adelphi', page_count: 320, isbn_13: '9788845900000', language: null }));
    const details = await screen.findByRole('region', { name: 'Dettagli' });
    expect(within(details).getByText('Editore')).toBeInTheDocument();
    expect(within(details).getByText('Adelphi')).toBeInTheDocument();
    expect(within(details).getByText('320')).toBeInTheDocument();
    expect(within(details).getByText('ISBN-13')).toBeInTheDocument();
    expect(within(details).queryByText('Lingua')).toBeNull();
    expect(within(details).queryByText('Anno')).toBeNull();
  });

  it('does not edit the book itself (only its tags and reading state)', async () => {
    open(book(1));
    await screen.findByRole('region', { name: 'Prestito' });
    expect(screen.queryByRole('button', { name: /^(?!modifica tag$)(modific|edit)/i })).toBeNull();
  });

  it('shows a dedicated state for a book that does not exist', async () => {
    open(book(1), '/books/missing');
    expect(await screen.findByText('Libro non trovato')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Torna all'elenco" })).toBeInTheDocument();
  });
});

describe('description', () => {
  /** jsdom has no layout: say the paragraph is taller than its six lines. */
  function layout(scrollHeight: number, clientHeight: number) {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight);
  }

  it('is closed past six lines and opens with the toggle', async () => {
    layout(400, 150);
    const user = userEvent.setup();
    open(book(1, { description: 'Una storia molto lunga. '.repeat(40) }));
    const toggle = await screen.findByRole('button', { name: /Leggi tutto/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(screen.getByRole('button', { name: /Mostra meno/ })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: /Mostra meno/ }));
    expect(screen.getByRole('button', { name: /Leggi tutto/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('has no toggle when it fits', async () => {
    layout(120, 120);
    open(book(1, { description: 'Breve.' }));
    expect(await screen.findByText('Breve.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Leggi tutto/ })).toBeNull();
  });

  it('is left out when the book has none', async () => {
    open(book(1));
    await screen.findByRole('region', { name: 'Prestito' });
    expect(screen.queryByRole('region', { name: 'Descrizione' })).toBeNull();
  });
});

describe('way back', () => {
  it('returns to the list with the search kept', async () => {
    const user = userEvent.setup();
    const { router } = renderSearch({
      api: { books: [book(1, { on_loan: true }), book(2, { on_loan: true })] },
      route: '/search?q=Libro&filter=loan',
    });
    await user.click(await screen.findByRole('link', { name: /^Libro 2 Autore 2/ }));
    await user.click(await screen.findByRole('link', { name: "Torna all'elenco" }));
    expect(router.state.location.pathname).toBe('/search');
    expect(router.state.location.search).toBe('?q=Libro&filter=loan');
    expect(await screen.findByRole('searchbox')).toHaveValue('Libro');
    expect(screen.getByRole('button', { name: 'In prestito' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('returns to the plain list from a direct link', async () => {
    const user = userEvent.setup();
    const { router } = open(book(1));
    await user.click(await screen.findByRole('link', { name: "Torna all'elenco" }));
    expect(router.state.location.pathname).toBe('/search');
    expect(router.state.location.search).toBe('');
  });
});
