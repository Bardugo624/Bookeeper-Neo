import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '../../session/fixtures';
import { ROW_HEIGHT } from './ResultList';
import { book, renderSearch, stubObserver } from './testkit';

const all = Array.from({ length: 2000 }, (_, i) => book(i + 1));
/** The server answers every page with all 2000 books, so the list has them from the start. */
const api = {
  books: all,
  override: (call: { path: string }) =>
    call.path.startsWith('/api/v1/books?') ? ok({ items: all, total: 2000, limit: 2000, offset: 0 }) : undefined,
};

let scrolled = 0;
/** The furthest the page can scroll, as when a rotated screen makes it shorter. */
let maxScroll = Infinity;
/** Where the page is scrolled: `scrolled` is what the list sees, `scrollY` what the page reports. */
function stubWindowScroll() {
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrolled });
  vi.spyOn(window, 'scrollTo').mockImplementation(((_x: number, y: number) => {
    scrolled = Math.min(y, maxScroll);
  }) as typeof window.scrollTo);
}
const rows = () => within(screen.getByRole('list', { name: 'Libri' })).getAllByRole('link');
const scrollTo = async (y: number) => {
  scrolled = y;
  act(() => void window.dispatchEvent(new Event('scroll')));
  await waitFor(() => expect(rows()[0]!.getAttribute('aria-label')).not.toBeNull());
};

afterEach(() => {
  scrolled = 0;
  maxScroll = Infinity;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** The list starts at the top of the page; `rowHeight` gives a row's height (jsdom has no layout). */
function stubLayout(rowHeight?: (row: Element) => number) {
  const real = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.tagName === 'UL') return { top: -scrolled, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: -scrolled, toJSON() {} } as DOMRect;
    if (this.tagName === 'LI' && rowHeight) {
      const height = rowHeight(this);
      return { top: 0, bottom: height, left: 0, right: 0, width: 0, height, x: 0, y: 0, toJSON() {} } as DOMRect;
    }
    return real.call(this);
  });
}

/** Replaces `ResizeObserver`; `resize()` reports every observed element, as a text size change does. */
function stubResize() {
  const observers = new Set<{ cb: ResizeObserverCallback; els: Set<Element> }>();
  class Stub {
    entry = { cb: (() => {}) as ResizeObserverCallback, els: new Set<Element>() };
    constructor(cb: ResizeObserverCallback) {
      this.entry.cb = cb;
      observers.add(this.entry);
    }
    observe(el: Element) {
      this.entry.els.add(el);
      this.entry.cb([{ target: el } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve(el: Element) {
      this.entry.els.delete(el);
    }
    disconnect() {
      this.entry.els.clear();
    }
  }
  vi.stubGlobal('ResizeObserver', Stub);
  return {
    observed: () => [...observers].reduce((n, o) => n + o.els.size, 0),
    resize: () =>
      act(() => {
        for (const o of observers) o.cb([...o.els].map((target) => ({ target }) as ResizeObserverEntry), {} as ResizeObserver);
      }),
  };
}

const list = () => screen.getByRole('list', { name: 'Libri' });
const firstShown = () => Number(/Libro (\d+),/.exec(rows()[0]!.getAttribute('aria-label') ?? '')![1]) - 1;
/** Height the spacers and rows add up to, with `h` per row. */
const total = (h: number) => parseFloat(list().style.paddingTop) + parseFloat(list().style.paddingBottom) + rows().length * h;

describe('windowed result list', () => {
  it('keeps at most 80 rows in the DOM wherever the page is scrolled', async () => {
    stubLayout();
    renderSearch({ api });
    await screen.findByRole('link', { name: /Libro 1,/ });
    expect(rows().length).toBeLessThanOrEqual(80);
    for (const y of [0, 5000, 90000, 177000]) {
      await scrollTo(y);
      await waitFor(() => expect(rows().length).toBeGreaterThan(0));
      expect(rows().length).toBeLessThanOrEqual(80);
    }
    expect(total(ROW_HEIGHT)).toBe(2000 * ROW_HEIGHT);
  });

  it('measures the row height once, so rows of titles of any length never move the list', async () => {
    // Titles of different lengths; were a long one taller (as with large text before the fixed
    // row height), a list that re-measured from whichever row comes first would jump.
    const books = all.map((b, i) => ({ ...b, title: i % 2 ? `${b.title}, ${'una storia lunga '.repeat(6)}` : b.title }));
    const long = new Set(books.filter((_, i) => i % 2).map((b) => b.title));
    stubLayout((row) => (long.has(row.querySelector('a')!.getAttribute('aria-label')!.split(', Autore')[0]!) ? 144 : 105));
    const resize = stubResize();
    renderSearch({
      api: {
        books,
        override: (call: { path: string }) =>
          call.path.startsWith('/api/v1/books?') ? ok({ items: books, total: 2000, limit: 2000, offset: 0 }) : undefined,
      },
    });
    await screen.findByRole('link', { name: /^Libro 1,/ });
    expect(screen.getByRole('link', { name: /^Libro 2, una storia lunga/ })).toBeInTheDocument();
    for (let y = 0; y <= 2000 * 105; y += 3700) {
      await scrollTo(y);
      // the row at the top of the view is the one 105px rows put there, six rows of margin above it
      await waitFor(() => expect(firstShown()).toBe(Math.max(0, Math.floor(y / 105) - 6)));
      expect(parseFloat(list().style.paddingTop)).toBe(firstShown() * 105);
      expect(total(105)).toBe(2000 * 105);
      expect(rows().length).toBeLessThanOrEqual(80);
    }
    expect(resize.observed()).toBe(1);
  });

  it('measures again when the watched row is resized, as when the text grows', async () => {
    let height = 105;
    stubLayout(() => height);
    const resize = stubResize();
    renderSearch({ api });
    await screen.findByRole('link', { name: /^Libro 1,/ });
    await scrollTo(200 * 105);
    await screen.findByRole('link', { name: /^Libro 201,/ });
    height = 150;
    resize.resize();
    await scrollTo(200 * 150);
    await waitFor(() => expect(parseFloat(list().style.paddingTop)).toBe(firstShown() * 150));
    expect(total(150)).toBe(2000 * 150);
    expect(screen.getByRole('link', { name: /^Libro 201,/ })).toBeInTheDocument();
  });

  it('shows the rows at the scrolled position, and the same ones again when coming back to it', async () => {
    stubLayout();
    stubWindowScroll();
    const user = userEvent.setup();
    const { router } = renderSearch({ api });
    await screen.findByRole('link', { name: /Libro 1,/ });
    await scrollTo(100 * ROW_HEIGHT);
    await screen.findByRole('link', { name: /Libro 101,/ });
    expect(screen.queryByRole('link', { name: /Libro 1,/ })).toBeNull();
    await user.click(screen.getByRole('link', { name: /Libro 101,/ }));
    await screen.findByRole('heading', { level: 1, name: /Libro 101/ });
    // the card opens at the top, as a new page does
    scrolled = 0;
    await act(() => router.navigate(-1));
    await waitFor(() => expect(scrolled).toBe(100 * ROW_HEIGHT));
    await screen.findByRole('link', { name: /Libro 101,/ });
    expect(screen.queryByRole('link', { name: /Libro 1,/ })).toBeNull();
  });

  it('keeps saving the position after coming back to one the page can no longer reach', async () => {
    stubLayout();
    stubWindowScroll();
    const user = userEvent.setup();
    const { router } = renderSearch({ api });
    await screen.findByRole('link', { name: /Libro 1,/ });
    await scrollTo(100 * ROW_HEIGHT);
    await user.click(await screen.findByRole('link', { name: /Libro 101,/ }));
    await screen.findByRole('heading', { level: 1, name: /Libro 101/ });
    scrolled = 0;
    maxScroll = 50 * ROW_HEIGHT;
    await act(() => router.navigate(-1));
    await waitFor(() => expect(scrolled).toBe(50 * ROW_HEIGHT));
    maxScroll = Infinity;
    await scrollTo(30 * ROW_HEIGHT);
    await user.click(await screen.findByRole('link', { name: /Libro 31,/ }));
    await screen.findByRole('heading', { level: 1, name: /Libro 31/ });
    scrolled = 0;
    await act(() => router.navigate(-1));
    await waitFor(() => expect(scrolled).toBe(30 * ROW_HEIGHT));
    await screen.findByRole('link', { name: /Libro 31,/ });
  });

  it('comes back to the same row after the row height changed while the card was open', async () => {
    let height = 105;
    stubLayout(() => height);
    stubWindowScroll();
    const user = userEvent.setup();
    const { router } = renderSearch({ api });
    await screen.findByRole('link', { name: /^Libro 1,/ });
    await scrollTo(100 * 105);
    await user.click(await screen.findByRole('link', { name: /^Libro 101,/ }));
    await screen.findByRole('heading', { level: 1, name: /Libro 101/ });
    scrolled = 0;
    height = 140;
    await act(() => router.navigate(-1));
    await waitFor(() => expect(scrolled).toBe(100 * 140));
    await waitFor(() => expect(firstShown()).toBe(100 - 6));
    expect(parseFloat(list().style.paddingTop)).toBe(94 * 140);
  });

  it('still asks for the next page when the end comes into view', async () => {
    stubLayout();
    const view = stubObserver();
    const books = all.slice(0, 100);
    const { platform } = renderSearch({ api: { books } });
    await screen.findByRole('link', { name: /Libro 1,/ });
    await scrollTo(39 * ROW_HEIGHT);
    view.reach();
    await waitFor(() => expect(platform.fake.calls.some((c) => c.path.includes('offset=40'))).toBe(true));
  });
});
