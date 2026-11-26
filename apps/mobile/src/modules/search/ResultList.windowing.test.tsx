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
/** Where the page is scrolled: `scrolled` is what the list sees, `scrollY` what the page reports. */
function stubWindowScroll() {
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrolled });
  vi.spyOn(window, 'scrollTo').mockImplementation(((_x: number, y: number) => {
    scrolled = y;
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubLayout() {
  const real = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.tagName === 'UL') return { top: -scrolled, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: -scrolled, toJSON() {} } as DOMRect;
    return real.call(this);
  });
}

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
    const list = screen.getByRole('list', { name: 'Libri' });
    const total = parseFloat(list.style.paddingTop) + parseFloat(list.style.paddingBottom) + rows().length * ROW_HEIGHT;
    expect(total).toBe(2000 * ROW_HEIGHT);
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
