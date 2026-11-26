import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARD_HEIGHT } from './BookGrid';
import { ROW_HEIGHT } from './BookTable';
import { installIntersectionObserver, listCalls, makeDb, renderBooks, scrollToEnd } from './testkit';
import { visibleRows } from './useWindowedRows';

/** Fake measures: the list starts at the top of the page, the page is 800px high and 1000px wide. */
let scrollY = 0;
function scrollTo(y: number) {
  scrollY = y;
  act(() => {
    fireEvent.scroll(window);
  });
}

beforeEach(() => {
  scrollY = 0;
  installIntersectionObserver();
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const list = this.tagName === 'UL' || this.tagName === 'TBODY';
    const top = list ? -scrollY : 0;
    return { top, left: 0, right: 1000, bottom: top, width: 1000, height: 0, x: 0, y: top, toJSON() {} };
  });
});
afterEach(() => vi.restoreAllMocks());

/** Loads all `n` books by reaching the end of the list until every page was asked for. */
async function loadAll(platform: Parameters<typeof listCalls>[0], n: number) {
  const pages = Math.ceil(n / 60);
  for (let i = 0; i < pages; i++) {
    await waitFor(() => expect(listCalls(platform).length).toBeGreaterThanOrEqual(i + 1));
    scrollToEnd();
    await act(async () => {});
  }
  await waitFor(() => expect(listCalls(platform).some((p) => p.get('offset') === String((pages - 1) * 60))).toBe(true));
}

const cards = () => within(screen.getByRole('list', { name: 'Libri' })).getAllByRole('listitem');
const titles = (items: HTMLElement[]) => items.map((li) => [...(li.querySelector('a')?.querySelectorAll('span') ?? [])].filter((s) => !s.closest('[aria-hidden]')).map((s) => s.textContent).join(' ').trim());

describe('visibleRows', () => {
  it('keeps a margin of rows around the viewport and stays inside the list', () => {
    expect(visibleRows({ count: 100, cols: 1, pitch: 10, offset: 0, viewport: 50 })).toEqual({ first: 0, last: 8 });
    expect(visibleRows({ count: 100, cols: 1, pitch: 10, offset: 500, viewport: 50 })).toEqual({ first: 47, last: 58 });
    expect(visibleRows({ count: 100, cols: 1, pitch: 10, offset: 99999, viewport: 50 })).toEqual({ first: 99, last: 99 });
  });
});

describe('long grid', () => {
  it('renders only the cards near the viewport, wherever the page is scrolled', async () => {
    const { platform } = renderBooks({ books: makeDb(2000) });
    await screen.findByRole('link', { name: 'Libro 1 Autore 1' });
    await loadAll(platform, 2000);
    // 1000px wide: 6 cards per row, 334 rows.
    expect(cards().length).toBeLessThanOrEqual(200);
    expect(screen.getByRole('link', { name: 'Libro 1 Autore 1' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Libro 2000 Autore 2000' })).toBeNull();
    const list = screen.getByRole('list', { name: 'Libri' });
    expect(parseFloat(list.style.height)).toBe(334 * CARD_HEIGHT + 333 * 28);

    scrollTo(100 * (CARD_HEIGHT + 28));
    expect(cards().length).toBeLessThanOrEqual(200);
    expect(screen.getByRole('link', { name: 'Libro 601 Autore 601' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Libro 1 Autore 1' })).toBeNull();

    scrollTo(333 * (CARD_HEIGHT + 28));
    expect(cards().length).toBeLessThanOrEqual(200);
    expect(screen.getByRole('link', { name: 'Libro 2000 Autore 2000' })).toBeInTheDocument();
  });

  it('keeps the card that has the focus, even far from the window', async () => {
    const { platform } = renderBooks({ books: makeDb(2000) });
    await screen.findByRole('link', { name: 'Libro 1 Autore 1' });
    await loadAll(platform, 2000);
    const first = screen.getByRole('link', { name: 'Libro 1 Autore 1' });
    act(() => first.focus());
    scrollTo(300 * (CARD_HEIGHT + 28));
    expect(screen.getByRole('link', { name: 'Libro 1 Autore 1' })).toBe(first);
    expect(document.activeElement).toBe(first);
    expect(cards().length).toBeLessThanOrEqual(200);
    expect(titles(cards())).toContain('Libro 1801 Autore 1801');
    act(() => first.blur());
    expect(screen.queryByRole('link', { name: 'Libro 1 Autore 1' })).toBeNull();
  });

  it('selects a range across rows that are not rendered', async () => {
    const { platform } = renderBooks({ books: makeDb(2000) });
    await screen.findByRole('link', { name: 'Libro 1 Autore 1' });
    await loadAll(platform, 2000);
    await userEvent.click(screen.getByRole('button', { name: 'Seleziona' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seleziona «Libro 1»' }));
    scrollTo(100 * (CARD_HEIGHT + 28));
    const last = screen.getByRole('checkbox', { name: 'Seleziona «Libro 601»' });
    fireEvent.click(last, { shiftKey: true });
    expect(await screen.findByText(/^601\b/)).toBeTruthy();
  });
});

describe('long table', () => {
  it('renders only the rows near the viewport, wherever the page is scrolled', async () => {
    const { platform } = renderBooks({ books: makeDb(2000) }, '/books?view=list');
    await screen.findByRole('link', { name: 'Libro 1' });
    await loadAll(platform, 2000);
    const rows = () =>
      within(screen.getByRole('table', { name: 'Libri' }))
        .getAllByRole('row')
        .filter((r) => r.hasAttribute('data-index'));
    expect(rows().length).toBeLessThanOrEqual(200);
    expect(screen.queryByRole('link', { name: 'Libro 2000' })).toBeNull();

    scrollTo(1000 * ROW_HEIGHT);
    expect(rows().length).toBeLessThanOrEqual(200);
    expect(screen.getByRole('link', { name: 'Libro 1001' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Libro 1' })).toBeNull();

    scrollTo(1999 * ROW_HEIGHT);
    expect(screen.getByRole('link', { name: 'Libro 2000' })).toBeInTheDocument();
  });

  it('keeps the row that has the focus', async () => {
    const { platform } = renderBooks({ books: makeDb(2000) }, '/books?view=list');
    const link = await screen.findByRole('link', { name: 'Libro 1' });
    await loadAll(platform, 2000);
    act(() => link.focus());
    scrollTo(1500 * ROW_HEIGHT);
    expect(screen.getByRole('link', { name: 'Libro 1' })).toBe(link);
    expect(document.activeElement).toBe(link);
  });
});
