import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { book, installIntersectionObserver, renderBooks } from './testkit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});
afterEach(() => vi.unstubAllGlobals());

const full = book(1, {
  title: 'Il nome della rosa',
  subtitle: 'Romanzo',
  authors: ['Umberto Eco'],
  genre: 'Narrativa',
  published_year: 1980,
  description: 'Un monastero, sette giorni.',
  publisher: 'Bompiani',
  page_count: 503,
  language: 'it',
  isbn_13: '9788845292613',
  isbn_10: '8845292614',
  format: 'paperback',
  progressive_number: 42,
  on_loan: true,
  placement: { shelf_id: 's1', row_index: 2, slot_index: 4 },
});

describe('detail', () => {
  it('shows every field that is present', async () => {
    renderBooks({ books: [full] }, '/books/b1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Il nome della rosa' })).toBeInTheDocument();
    expect(screen.getByText('NARRATIVA · 1980', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Romanzo')).toBeInTheDocument();
    // The 3D cover prints the author too.
    expect(screen.getAllByText('Umberto Eco').length).toBeGreaterThan(0);
    expect(screen.getByText('Un monastero, sette giorni.')).toBeInTheDocument();
    const meta = {
      Editore: 'Bompiani',
      Pagine: '503',
      Lingua: 'it',
      'ISBN-13': '9788845292613',
      Formato: 'Brossura',
      'Numero progressivo': '42',
    };
    for (const [label, value] of Object.entries(meta)) {
      expect(screen.getByText(label).nextElementSibling).toHaveTextContent(value);
    }
    expect(screen.queryByText('ISBN-10')).toBeNull();
    const where = screen.getByRole('region', { name: 'Dove si trova' });
    expect(await within(where).findByText('Salotto')).toBeInTheDocument();
    expect(within(where).getByText('Ripiano 3')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Prestiti' })).getByText('In prestito')).toBeInTheDocument();
  });

  it('falls back to ISBN-10 and leaves out absent fields without empty labels', async () => {
    renderBooks({ books: [book(1, { title: 'Spoglio', authors: [], isbn_10: '8845292614', publisher: '  ' })] }, '/books/b1');
    await screen.findByRole('heading', { level: 1, name: 'Spoglio' });
    expect(screen.getByText('ISBN-10').nextElementSibling).toHaveTextContent('8845292614');
    for (const label of ['Editore', 'Pagine', 'Lingua', 'ISBN-13', 'Formato', 'Numero progressivo']) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.queryByRole('heading', { level: 2, name: '' })).toBeNull();
    expect(screen.getByText('Non collocato')).toBeInTheDocument();
    expect(screen.getByText('Non in prestito')).toBeInTheDocument();
  });

  it('omits the meta list entirely when no field is present', async () => {
    renderBooks({ books: [book(1, { authors: [] })] }, '/books/b1');
    await screen.findByRole('heading', { level: 1, name: 'Libro 1' });
    expect(screen.queryByRole('term')).toBeNull();
  });

  it('shows a dedicated empty state for a missing book', async () => {
    const { router } = renderBooks({ books: [] }, '/books/zz');
    expect(await screen.findByRole('heading', { name: 'Libro non trovato' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Torna ai libri' }));
    expect(router.state.location.pathname).toBe('/books');
  });

  it('"‹ Libri" goes back to the list with the same parameters', async () => {
    const { router } = renderBooks({ books: [full, book(2)] }, '/books?filter=loan&view=list&sort=title&order=desc');
    await userEvent.click(await screen.findByRole('link', { name: 'Il nome della rosa' }));
    expect(router.state.location.pathname).toBe('/books/b1');
    await userEvent.click(within(await screen.findByRole('main')).getByRole('link', { name: 'Libri' }));
    expect(router.state.location.pathname).toBe('/books');
    expect(new URLSearchParams(router.state.location.search).toString()).toBe(
      'filter=loan&view=list&sort=title&order=desc',
    );
  });

  it('has no write actions', async () => {
    renderBooks({ books: [full] }, '/books/b1');
    await screen.findByRole('heading', { level: 1, name: 'Il nome della rosa' });
    expect(screen.queryAllByRole('button', { name: /Aggiungi|Modifica|Presta|Segna come letto/ })).toHaveLength(0);
  });
});
