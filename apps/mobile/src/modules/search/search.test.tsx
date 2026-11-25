import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@bookeeper/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { book, listCalls, renderSearch, stubObserver } from './testkit';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const lib = (n: number) => Array.from({ length: n }, (_, i) => book(i + 1));
const rows = () => within(screen.getByRole('list', { name: 'Libri' })).getAllByRole('link');

describe('search page', () => {
  it('lists the latest books without text, with a live count', async () => {
    renderSearch({ api: { books: lib(3) } });
    expect(await screen.findByRole('link', { name: 'Libro 1, Autore 1' })).toBeInTheDocument();
    expect(rows()).toHaveLength(3);
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('3 libri');
  });

  it('waits 250 ms after the typing paused, then searches', async () => {
    const { platform } = renderSearch({ api: { books: [book(1, { title: 'Dune' }), book(2, { title: 'Emma' })] } });
    await screen.findByRole('link', { name: /Dune/ });
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const box = screen.getByRole('searchbox');
    fireEvent.change(box, { target: { value: 'em' } });
    act(() => void vi.advanceTimersByTime(249));
    expect(listCalls(platform).some((p) => p.includes('q=em'))).toBe(false);
    fireEvent.change(box, { target: { value: 'emm' } });
    act(() => void vi.advanceTimersByTime(249));
    expect(listCalls(platform).some((p) => p.includes('q='))).toBe(false);
    act(() => void vi.advanceTimersByTime(1));
    vi.useRealTimers();
    await waitFor(() => expect(listCalls(platform).some((p) => p.includes('q=emm'))).toBe(true));
    expect(await screen.findByRole('link', { name: /Emma/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Dune/ })).toBeNull();
  });

  it('clears the search with the button and shows the latest again', async () => {
    const user = userEvent.setup();
    const { router } = renderSearch({ api: { books: lib(2) }, route: '/search?q=Libro%202' });
    expect(await screen.findByRole('link', { name: /Libro 2/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Libro 1/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Svuota la ricerca' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(await screen.findByRole('link', { name: /Libro 1/ })).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
    expect(screen.queryByRole('button', { name: 'Svuota la ricerca' })).toBeNull();
  });

  it('commits at once on Enter and closes the keyboard', async () => {
    const user = userEvent.setup();
    const { router } = renderSearch({ api: { books: lib(2) } });
    await screen.findByRole('link', { name: /Libro 1/ });
    const box = screen.getByRole('searchbox');
    await user.type(box, 'Libro 2{Enter}');
    expect(router.state.location.search).toBe('?q=Libro+2');
    expect(box).not.toHaveFocus();
  });

  it('keeps search and filter in the address', async () => {
    const user = userEvent.setup();
    const { router, platform } = renderSearch({
      api: { books: [book(1, { on_loan: true }), book(2), book(3, { on_loan: true })] },
      route: '/search?q=Libro&filter=loan',
    });
    expect(await screen.findByRole('searchbox')).toHaveValue('Libro');
    expect(screen.getByRole('tab', { name: 'In prestito' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(listCalls(platform)[0]).toContain('on_loan=true');
    await user.click(screen.getByRole('tab', { name: 'Non collocati' }));
    expect(router.state.location.search).toBe('?q=Libro&filter=unshelved');
    await waitFor(() => expect(listCalls(platform).some((p) => p.includes('unshelved=true'))).toBe(true));
    await user.click(screen.getByRole('tab', { name: 'Tutti' }));
    expect(router.state.location.search).toBe('?q=Libro');
  });

  it('asks for the next page of 40 when the end of the list comes into view', async () => {
    const view = stubObserver();
    const { platform } = renderSearch({ api: { books: lib(50) } });
    await screen.findByRole('link', { name: /Libro 1,/ });
    expect(rows()).toHaveLength(40);
    expect(listCalls(platform)[0]).toContain('limit=40');
    view.reach();
    await waitFor(() => expect(rows()).toHaveLength(50));
    expect(listCalls(platform)[1]).toContain('offset=40');
    view.reach();
    expect(listCalls(platform)).toHaveLength(2);
  });
});

describe('a failed next page', () => {
  it('does not ask again by itself, and offers a retry', async () => {
    const view = stubObserver({ reportOnObserve: true });
    let fail = true;
    const { platform } = renderSearch({
      api: {
        books: lib(50),
        override: (call) =>
          fail && call.path.includes('offset=40')
            ? { status: 400, body: { error_code: 'bad', message: 'no' } }
            : undefined,
      },
    });
    const user = userEvent.setup();
    const retry = await screen.findByRole('button', { name: 'Riprova' });
    await new Promise((r) => setTimeout(r, 200));
    expect(listCalls(platform).filter((p) => p.includes('offset=40'))).toHaveLength(1);
    expect(rows()).toHaveLength(40);
    fail = false;
    await user.click(retry);
    await waitFor(() => expect(rows()).toHaveLength(50));
    expect(view).toBeDefined();
  });
});

describe('rows', () => {
  it('names a row "title, author" and tags only the books on loan', async () => {
    renderSearch({ api: { books: [book(1, { on_loan: true }), book(2)] } });
    const lent = await screen.findByRole('link', { name: 'Libro 1, Autore 1' });
    expect(lent).toHaveAccessibleDescription('In prestito');
    expect(within(lent).getByText('In prestito')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: 'Libro 2, Autore 2' })).queryByText('In prestito')).toBeNull();
  });

  it('names a book with no author by its title', async () => {
    renderSearch({ api: { books: [book(1, { authors: [] })] } });
    expect(await screen.findByRole('link', { name: 'Libro 1' })).toBeInTheDocument();
  });

  it('opens the book on a tap', async () => {
    const { router } = renderSearch({ api: { books: lib(2) } });
    await userEvent.setup().click(await screen.findByRole('link', { name: 'Libro 2, Autore 2' }));
    expect(router.state.location.pathname).toBe('/books/b2');
    expect(await screen.findByRole('heading', { level: 2, name: 'Libro 2' })).toBeInTheDocument();
  });
});

describe('states', () => {
  it('shows skeletons while loading', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    renderSearch({
      api: {
        books: lib(1),
        override: (call) => (call.path.startsWith('/api/v1/books?') ? gate.then(() => undefined) : undefined),
      },
    });
    await screen.findByRole('searchbox');
    expect(screen.getByRole('status', { name: 'Caricamento…' })).toBeInTheDocument();
    release();
    await screen.findByRole('link', { name: /Libro 1/ });
    expect(screen.queryByRole('status', { name: 'Caricamento…' })).toBeNull();
  });

  it('says so when the library is empty', async () => {
    renderSearch({ api: { books: [] } });
    expect(await screen.findByText('La libreria è vuota')).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    renderSearch({ api: { books: lib(2) }, route: '/search?q=zzz' });
    expect(await screen.findByText('Nessun risultato')).toBeInTheDocument();
    expect(screen.getByText('Nessun libro corrisponde a «zzz».')).toBeInTheDocument();
  });

  it('shows the error with "Riprova", which asks again', async () => {
    let fail = true;
    const user = userEvent.setup();
    const { platform } = renderSearch({
      api: {
        books: lib(2),
        override: (call) =>
          fail && call.path.startsWith('/api/v1/books?') ? { status: 403, body: { error_code: 'forbidden', message: 'x' } } : undefined,
      },
    });
    const retry = await screen.findByRole('button', { name: 'Riprova' }, { timeout: 5000 });
    fail = false;
    const before = listCalls(platform).length;
    await user.click(retry);
    expect(await screen.findByRole('link', { name: /Libro 1/ })).toBeInTheDocument();
    expect(listCalls(platform).length).toBeGreaterThan(before);
  });

  it('keeps the last result with the offline strip when a new search finds no network', async () => {
    let down = false;
    const user = userEvent.setup();
    const { platform } = renderSearch({
      api: {
        books: lib(3),
        override: (call) => {
          if (down && call.path.startsWith('/api/v1/books?')) throw new ApiError(0, 'network', 'The server could not be reached');
          return undefined;
        },
      },
    });
    await screen.findByRole('link', { name: /Libro 1/ });
    down = true;
    act(() => platform.network.set(false));
    await user.click(screen.getByRole('tab', { name: 'In prestito' }));
    expect(await screen.findByText('Sei offline')).toBeInTheDocument();
    await waitFor(() => expect(listCalls(platform).some((p) => p.includes('on_loan=true'))).toBe(true));
    // The last result stays; there is no error state.
    expect(screen.getByRole('link', { name: /Libro 1/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Riprova' })).toBeNull();
    // Typing a new search offline behaves the same.
    await user.type(screen.getByRole('searchbox'), 'x{Enter}');
    await waitFor(() => expect(listCalls(platform).some((p) => p.includes('q=x'))).toBe(true));
    expect(screen.getByRole('link', { name: /Libro 1/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Riprova' })).toBeNull();
  });
});
