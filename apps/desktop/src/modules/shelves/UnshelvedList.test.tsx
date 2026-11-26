import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROW_PITCH } from './UnshelvedList';
import { book, renderShelves, shelf } from './testkit';

afterEach(() => vi.restoreAllMocks());

const rows = () => [...document.querySelectorAll<HTMLElement>('[data-book-id]')];

describe('long unplaced list', () => {
  it('keeps every row when the list is short', async () => {
    renderShelves({ shelves: [shelf(1)], books: Array.from({ length: 150 }, (_, i) => book(`u${i + 1}`)), spots: {} });
    await waitFor(() => expect(rows()).toHaveLength(150));
  });

  it('renders only the rows near the scroll position of a long list', async () => {
    // The list box is 360px high.
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
    renderShelves({ shelves: [shelf(1)], books: Array.from({ length: 2000 }, (_, i) => book(`u${i + 1}`)), spots: {} });
    await screen.findByText('Libro u1');
    expect(rows().length).toBeLessThanOrEqual(200);
    expect(screen.queryByText('Libro u2000')).toBeNull();
    const list = rows()[0]!.parentElement!;

    for (const at of [500, 1999]) {
      list.scrollTop = at * ROW_PITCH;
      act(() => {
        fireEvent.scroll(list);
      });
      expect(rows().length).toBeLessThanOrEqual(200);
      expect(screen.getByText(`Libro u${at + 1}`)).toBeInTheDocument();
    }
    expect(screen.queryByText('Libro u1')).toBeNull();
  });

  it('keeps the row that has the focus', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(360);
    renderShelves({ shelves: [shelf(1)], books: Array.from({ length: 2000 }, (_, i) => book(`u${i + 1}`)), spots: {} });
    await screen.findByText('Libro u1');
    const button = rows()[0]!.querySelector('button')!;
    act(() => button.focus());
    const list = rows()[0]!.parentElement!;
    list.scrollTop = 1500 * ROW_PITCH;
    act(() => {
      fireEvent.scroll(list);
    });
    expect(document.activeElement).toBe(button);
    expect(button.isConnected).toBe(true);
    expect(rows().length).toBeLessThanOrEqual(200);
  });
});
