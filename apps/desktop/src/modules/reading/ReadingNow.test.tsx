import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { book, installIntersectionObserver, renderBooksWithReader } from '../books/testkit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});

const reading = (i: number, over = {}) =>
  book(i, {
    file_formats: ['epub'],
    updated_at: 1000 + i,
    reading: { status: 'reading', progress_percent: i * 10, current_page: null },
    ...over,
  });

describe('«In lettura»', () => {
  it('reading_now_hides_with_filters_or_search', async () => {
    const books = [reading(1), book(2)];
    const { unmount } = renderBooksWithReader({ books }, '/books');
    expect(await screen.findByRole('region', { name: 'In lettura' })).toBeTruthy();
    unmount();
    renderBooksWithReader({ books }, '/books?q=libro');
    await screen.findAllByText('Libro 1');
    expect(screen.queryByRole('region', { name: 'In lettura' })).toBeNull();
  });

  it('hides with a filter', async () => {
    renderBooksWithReader({ books: [reading(1), book(2)] }, '/books?reading=reading');
    await screen.findAllByText('Libro 1');
    expect(screen.queryByRole('region', { name: 'In lettura' })).toBeNull();
  });

  it('reading_now_shows_at_most_four_recent_first', async () => {
    const books = [1, 2, 3, 4, 5].map((i) => reading(i)).concat([reading(6, { file_formats: [] }), book(7)]);
    renderBooksWithReader({ books }, '/books');
    const region = await screen.findByRole('region', { name: 'In lettura' });
    const links = within(region).getAllByRole('link');
    expect(links.map((l) => within(l).getByText(/^Libro/).textContent)).toEqual(['Libro 5', 'Libro 4', 'Libro 3', 'Libro 2']);
    expect(within(region).getAllByRole('progressbar')[0]!.getAttribute('aria-valuenow')).toBe('50');
    expect(within(region).getByText('50%')).toBeTruthy();
    expect(within(region).getByText('Autore 5')).toBeTruthy();
    expect(within(region).getByRole('button', { name: 'Tutti i 5' })).toBeTruthy();
  });

  it('all_applies_the_reading_filter', async () => {
    const view = renderBooksWithReader({ books: [reading(1), reading(2), book(3)] }, '/books');
    await userEvent.click(await screen.findByRole('button', { name: 'Tutti i 2' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'In lettura' })).toBeNull());
    expect(view.platform.calls.some((c) => c.path.includes('reading=reading') && c.path.includes('limit=60'))).toBe(true);
  });

  it('a_card_opens_the_reader', async () => {
    renderBooksWithReader({ books: [reading(1)] }, '/books');
    const region = await screen.findByRole('region', { name: 'In lettura' });
    await userEvent.click(within(region).getByRole('link'));
    expect((await screen.findByTestId('reader-probe')).textContent).toBe('reader b1');
  });
});
