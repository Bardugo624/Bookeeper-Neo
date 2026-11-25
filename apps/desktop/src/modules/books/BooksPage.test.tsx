import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { book, installIntersectionObserver, listCalls, makeDb, renderBooks, scrollToEnd } from './testkit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const cards = () => within(screen.getByRole('list', { name: 'Libri' })).getAllByRole('listitem');

describe('loading and counts', () => {
  it('shows twelve skeleton cards, then twelve books', async () => {
    renderBooks({ books: makeDb(12) });
    const loading = await screen.findByRole('list', { name: 'Caricamento dei libri' });
    expect(within(loading).getAllByRole('listitem')).toHaveLength(12);
    await screen.findByRole('link', { name: 'Libro 1, Autore 1' });
    expect(cards()).toHaveLength(12);
    expect(screen.queryByRole('list', { name: 'Caricamento dei libri' })).toBeNull();
  });

  it('counts with plurals and the loans from a second request', async () => {
    const books = [book(1, { on_loan: true })];
    const { unmount } = renderBooks({ books });
    expect(await screen.findByText('1 libro · 1 in prestito')).toBeInTheDocument();
    unmount();
    const many = makeDb(248);
    many[0] = book(1, { on_loan: true });
    renderBooks({ books: many });
    expect(await screen.findByText('248 libri · 1 in prestito')).toBeInTheDocument();
  });

  it('asks the loan count with limit 1', async () => {
    const { platform } = renderBooks({ books: makeDb(3) });
    await screen.findByText('3 libri · 0 in prestito');
    expect(listCalls(platform).some((p) => p.get('on_loan') === 'true' && p.get('limit') === '1')).toBe(true);
  });
});

describe('search', () => {
  it('sends one request with q after 250 ms', async () => {
    const { platform } = renderBooks({ books: makeDb(5) });
    await screen.findByRole('link', { name: 'Libro 1, Autore 1' });
    const field = screen.getByRole('searchbox', { name: 'Cerca nei libri' });
    const before = listCalls(platform).length;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.change(field, { target: { value: 'Lib' } });
    fireEvent.change(field, { target: { value: 'Libro 2' } });
    await act(() => vi.advanceTimersByTimeAsync(249));
    expect(listCalls(platform)).toHaveLength(before);
    await act(() => vi.advanceTimersByTimeAsync(10));
    const sent = listCalls(platform).slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.get('q')).toBe('Libro 2');
    // React Query batches its notifications with a timer: let it run.
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(screen.getByText('1 libro · 0 in prestito')).toBeInTheDocument();
  });

  it('clears the search and Ctrl K focuses the field', async () => {
    const { router } = renderBooks({ books: makeDb(4) }, '/books?q=Libro%203');
    const field = await screen.findByRole('searchbox', { name: 'Cerca nei libri' });
    await screen.findByText('1 libro · 0 in prestito');
    expect(field).toHaveValue('Libro 3');
    await userEvent.click(screen.getByRole('button', { name: 'Svuota la ricerca' }));
    expect(field).toHaveValue('');
    expect(router.state.location.search).toBe('');
    await screen.findByText('4 libri · 0 in prestito');
    await userEvent.click(document.body);
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(field).toHaveFocus();
  });
});

describe('filters', () => {
  it('"In prestito" sends on_loan=true and lives in the address', async () => {
    const books = [book(1, { on_loan: true }), book(2), book(3)];
    const { platform, router } = renderBooks({ books });
    await screen.findByText('3 libri · 1 in prestito');
    await userEvent.click(screen.getByRole('tab', { name: 'In prestito' }));
    await screen.findByText('1 libro · 1 in prestito');
    expect(router.state.location.search).toBe('?filter=loan');
    expect(listCalls(platform).some((p) => p.get('on_loan') === 'true' && p.get('limit') === '60')).toBe(true);
    expect(cards()).toHaveLength(1);
  });

  it('"Non collocati" sends unshelved=true', async () => {
    const books = [book(1, { placement: { shelf_id: 's1', row_index: 0, slot_index: 0 } }), book(2)];
    const { platform } = renderBooks({ books });
    await screen.findByText('2 libri · 0 in prestito');
    await userEvent.click(screen.getByRole('tab', { name: 'Non collocati' }));
    await screen.findByText('1 libro · 0 in prestito');
    expect(listCalls(platform).some((p) => p.get('unshelved') === 'true')).toBe(true);
  });

  it('offers no reading-state filters and no "mark as read"', async () => {
    renderBooks({ books: makeDb(1), role: 'guest' });
    await screen.findByRole('tablist', { name: 'Filtri' });
    for (const name of ['Da leggere', 'In lettura', 'Letti', 'Filtri']) {
      expect(screen.queryByRole('tab', { name })).toBeNull();
    }
    for (const name of [/Aggiungi/, /Modifica/, /Presta/, /Elimina/, /Seleziona/, /Segna come letto/]) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });
});

describe('paging', () => {
  it('asks offset 60 when the end comes into view, then stops at the end', async () => {
    const { platform } = renderBooks({ books: makeDb(100) });
    await screen.findByRole('link', { name: 'Libro 1, Autore 1' });
    expect(listCalls(platform).filter((p) => p.get('offset') === '60')).toHaveLength(0);
    scrollToEnd();
    await screen.findByRole('link', { name: 'Libro 100, Autore 100' });
    expect(listCalls(platform).filter((p) => p.get('offset') === '60')).toHaveLength(1);
    const total = listCalls(platform).length;
    scrollToEnd();
    await act(async () => {});
    expect(listCalls(platform)).toHaveLength(total);
    expect(cards()).toHaveLength(100);
  });
});

describe('grid and list', () => {
  it('remembers the choice per connection and reads it back', async () => {
    const first = renderBooks({ books: makeDb(3) });
    await screen.findByRole('link', { name: 'Libro 1, Autore 1' });
    await userEvent.click(screen.getByRole('tab', { name: 'Lista' }));
    expect(await screen.findByRole('table', { name: 'Libri' })).toBeInTheDocument();
    expect(localStorage.getItem('bookeeper.books.view.c1')).toBe('list');
    first.unmount();
    renderBooks({ books: makeDb(3) });
    expect(await screen.findByRole('table', { name: 'Libri' })).toBeInTheDocument();
  });

  it('sorts by column with aria-sort and sends sort/order', async () => {
    const { platform } = renderBooks({ books: makeDb(3) }, '/books?view=list');
    const title = await screen.findByRole('columnheader', { name: 'Titolo' });
    expect(title).toHaveAttribute('aria-sort', 'none');
    await userEvent.click(within(title).getByRole('button', { name: 'Titolo' }));
    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Titolo' })).toHaveAttribute('aria-sort', 'ascending'));
    expect(listCalls(platform).some((p) => p.get('sort') === 'title' && p.get('order') === 'asc')).toBe(true);
    await userEvent.click(within(screen.getByRole('columnheader', { name: 'Titolo' })).getByRole('button'));
    await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Titolo' })).toHaveAttribute('aria-sort', 'descending'));
    expect(listCalls(platform).some((p) => p.get('sort') === 'title' && p.get('order') === 'desc')).toBe(true);
    expect(screen.getByRole('columnheader', { name: 'Collocazione' })).not.toHaveAttribute('aria-sort');
  });

  it('shows placement and loan state in the list', async () => {
    const books = [book(1, { on_loan: true, published_year: 1980, placement: { shelf_id: 's1', row_index: 1, slot_index: 0 } })];
    renderBooks({ books }, '/books?view=list');
    expect(await screen.findByRole('link', { name: 'Libro 1' })).toBeInTheDocument();
    expect(await screen.findByText('Salotto · Ripiano 2')).toBeInTheDocument();
    expect(screen.getByText('1980')).toBeInTheDocument();
  });
});

describe('states', () => {
  it('shows "Nessun libro" for an empty library', async () => {
    renderBooks({ books: [] });
    expect(await screen.findByRole('heading', { name: 'Nessun libro' })).toBeInTheDocument();
  });

  it('shows "Nessun risultato" and resets search and filters', async () => {
    const { router } = renderBooks({ books: makeDb(3) }, '/books?q=zzz&filter=loan');
    expect(await screen.findByRole('heading', { name: 'Nessun risultato' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Azzera ricerca e filtri' }));
    await screen.findByRole('link', { name: 'Libro 1, Autore 1' });
    expect(router.state.location.search).toBe('');
  });

  it('shows the error and "Riprova" asks again', async () => {
    const lib = { books: makeDb(2), fail: { on: true } };
    const { platform } = renderBooks(lib);
    await screen.findByRole('heading', { name: 'Non riesco a leggere i libri' });
    const before = listCalls(platform).length;
    lib.fail.on = false;
    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    await screen.findByRole('link', { name: 'Libro 1, Autore 1' });
    expect(listCalls(platform).length).toBeGreaterThan(before);
  });
});

describe('card', () => {
  it('has an accessible name, goes to the detail and shows the loan label only when on loan', async () => {
    const books = [book(1, { authors: ['Ada', 'Bo'], on_loan: true }), book(2)];
    const { router } = renderBooks({ books });
    const link = await screen.findByRole('link', { name: 'Libro 1, Ada, Bo' });
    expect(within(link).getByText('Ada, Bo')).toBeInTheDocument();
    expect(within(link).getByText('In prestito')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: 'Libro 2, Autore 2' })).queryByText('In prestito')).toBeNull();
    await userEvent.click(link);
    expect(router.state.location.pathname).toBe('/books/b1');
  });
});

describe('cover', () => {
  it('turns the bytes into an object URL and revokes it on unmount', async () => {
    const create = vi.fn(() => 'blob:cover-1');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const { container, unmount, platform } = renderBooks({
      books: [book(1, { cover_color: '#aabbcc' })],
      cover: { bytes: new Uint8Array([1, 2, 3]), etag: '"e1"' },
    });
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', 'blob:cover-1'));
    expect(platform.calls.some((c) => c.path === '/api/v1/books/b1/cover')).toBe(true);
    expect(revoke).not.toHaveBeenCalled();
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:cover-1');
  });

  it('does not request the cover of a book that has none', async () => {
    const { platform } = renderBooks({ books: makeDb(3) });
    await screen.findByRole('link', { name: 'Libro 1, Autore 1' });
    expect(platform.calls.some((c) => c.path.endsWith('/cover'))).toBe(false);
  });

  it('draws the placeholder with cover_color when there is no image', async () => {
    const { container } = renderBooks({ books: [book(1, { cover_color: '#aabbcc' })] });
    await screen.findByRole('link', { name: 'Libro 1, Autore 1' });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector<HTMLElement>('[style*="--cover-bg"]')!.style.getPropertyValue('--cover-bg')).toBe('#aabbcc');
  });
});
