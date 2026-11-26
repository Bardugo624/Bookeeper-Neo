import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetThemeForTest } from '../../theme/useTheme';
import { book, renderPalette, searches } from './testkit';

const box = () => screen.findByRole('combobox', { name: 'Cerca o lancia un comando' });

async function openPalette(keys = '{Control>}k{/Control}') {
  await screen.findByRole('navigation', { name: 'Navigazione principale' });
  await userEvent.keyboard(keys);
  return box();
}

beforeEach(() => {
  localStorage.clear();
  resetThemeForTest();
});

describe('opening and closing', () => {
  it.each([['{Control>}k{/Control}'], ['{Meta>}k{/Meta}']])('%s opens it, Esc closes it and the focus comes back', async (keys) => {
    renderPalette();
    await screen.findByRole('navigation', { name: 'Navigazione principale' });
    const opener = screen.getByRole('link', { name: 'Libri' });
    opener.focus();
    await userEvent.keyboard(keys);
    const input = await box();
    expect(input).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Palette dei comandi' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('opens from the hint in the sidebar', async () => {
    renderPalette();
    await userEvent.click(await screen.findByRole('button', { name: /Cerca o lancia/ }));
    expect(await box()).toHaveFocus();
  });

  it('without text it offers the actions and "Vai a"', async () => {
    renderPalette();
    await openPalette();
    expect(screen.getByRole('group', { name: 'Azioni' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Vai a' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Libri' })).not.toBeInTheDocument();
  });
});

describe('go to', () => {
  it('"scaff" and Enter lead to the shelves', async () => {
    const { router } = renderPalette();
    await openPalette();
    await userEvent.keyboard('scaff{Enter}');
    expect(router.state.location.pathname).toBe('/shelves');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores case and accents', async () => {
    const { router } = renderPalette();
    await openPalette();
    await userEvent.keyboard('STATÍSTICHE{Enter}');
    expect(router.state.location.pathname).toBe('/stats');
  });

  it('lists the sections of the settings', async () => {
    const { router } = renderPalette();
    await openPalette();
    await userEvent.keyboard('aspetto{Enter}');
    expect(router.state.location.pathname).toBe('/settings/appearance');
  });

  it('says so when nothing matches', async () => {
    renderPalette();
    await openPalette();
    await userEvent.keyboard('zzzz');
    expect(await screen.findByText('Nessun risultato')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});

describe('books', () => {
  afterEach(() => vi.useRealTimers());

  it('asks the catalogue once, after 200 ms, and Enter opens the book', async () => {
    const { router, platform } = renderPalette({ books: [book(1), book(2)] });
    await openPalette();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const typed = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await typed.keyboard('Libro 2');
    const before = searches(platform).length;
    await act(() => vi.advanceTimersByTimeAsync(150));
    expect(searches(platform)).toHaveLength(before);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(searches(platform).slice(before)).toEqual(['Libro 2']);
    // React Query batches its notifications with a timer: let it run before the real clock returns.
    await act(() => vi.advanceTimersByTimeAsync(50));
    vi.useRealTimers();
    const option = await screen.findByRole('option', { name: /Libro 2/ });
    expect(option).toHaveTextContent('Autore 2');
    await userEvent.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/books/b2');
  });

  it('does not search for a single character', async () => {
    const { platform } = renderPalette({ books: [book(1)] });
    await openPalette();
    await userEvent.keyboard('L');
    await new Promise((r) => setTimeout(r, 300));
    expect(searches(platform)).toEqual([]);
  });
});

describe('where is it', () => {
  const placed = book(1, { title: 'Dune', placement: { shelf_id: 's1', row_index: 1, slot_index: 0 } });
  const loose = book(2, { title: 'Dubliners' });

  it('shows the place and goes to the shelf with the unit and the book', async () => {
    const { router } = renderPalette({ books: [placed, loose] });
    await openPalette();
    await userEvent.keyboard("dov'è dune");
    const option = await screen.findByRole('option', { name: /Dune/ });
    expect(option).toHaveTextContent('Libreria del salotto · ripiano 2 · posto 1');
    await userEvent.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/shelves');
    expect(router.state.location.search).toBe('?unit=s1&book=b1');
  });

  it('"dove" works too, and an unplaced book opens its page', async () => {
    const { router } = renderPalette({ books: [placed, loose] });
    await openPalette();
    await userEvent.keyboard('DOVE dub');
    const option = await screen.findByRole('option', { name: /Dubliners/ });
    expect(option).toHaveTextContent('Non collocato');
    await userEvent.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/books/b2');
  });

  it('the action "Dov\'è un libro?" starts the question', async () => {
    renderPalette({ books: [placed] });
    await openPalette();
    await userEvent.click(screen.getByRole('option', { name: "Dov'è un libro?" }));
    expect(await box()).toHaveValue("dov'è ");
    expect(await screen.findByText('Scrivi il titolo del libro da cercare')).toBeInTheDocument();
  });
});

describe('actions', () => {
  it('"Nuovo libro" opens the form and is missing without the right to write', async () => {
    const { router, unmount } = renderPalette({ role: 'member' });
    await openPalette();
    await userEvent.keyboard('nuovo libro{Enter}');
    expect(router.state.location.pathname + router.state.location.search).toBe('/books?new=1');
    unmount();

    renderPalette({ role: 'guest' });
    await openPalette();
    await userEvent.keyboard('nuovo');
    expect(screen.queryByRole('option', { name: 'Nuovo libro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Nuovo prestito' })).not.toBeInTheDocument();
  });

  it('changes the theme', async () => {
    renderPalette();
    await openPalette();
    await userEvent.keyboard('tema scuro{Enter}');
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('bookeeper.theme')).toBe('dark');
    document.documentElement.classList.remove('dark');
  });

  it('opens the list of the shortcuts', async () => {
    renderPalette();
    await openPalette();
    await userEvent.keyboard('scorciatoie{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Scorciatoie da tastiera' })).toBeInTheDocument();
  });

  it('"Esci" signs out', async () => {
    const { platform } = renderPalette();
    await openPalette();
    await userEvent.keyboard('esci{Enter}');
    await waitFor(() => expect(platform.calls.some((c) => c.path === '/api/v1/auth/logout')).toBe(true));
  });
});

describe('combobox', () => {
  it('exposes combobox and listbox, and the active option follows the arrows', async () => {
    renderPalette();
    const input = await openPalette();
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('listbox');
    expect(input).toHaveAttribute('aria-controls', list.id);
    const options = within(list).getAllByRole('option');
    const active = () => input.getAttribute('aria-activedescendant');
    expect(active()).toBe(options[0]!.id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toBe(options[1]!.id);
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(active()).toBe(options.at(-1)!.id);
    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toBe(options[0]!.id);
    expect(input).toHaveFocus();
  });
});
