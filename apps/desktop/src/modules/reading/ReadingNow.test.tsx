import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    expect(within(region).getByRole('button', { name: 'Tutti i 6' })).toBeTruthy();
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

  it('orders by when the book was read, not when its details changed', async () => {
    const books = [reading(1), reading(2), reading(3)];
    renderBooksWithReader({ books, readOrder: ['b1', 'b3', 'b2'] }, '/books');
    const region = await screen.findByRole('region', { name: 'In lettura' });
    const titles = within(region).getAllByRole('link').map((l) => within(l).getByText(/^Libro/).textContent);
    expect(titles).toEqual(['Libro 1', 'Libro 3', 'Libro 2']);
  });

  it('counts the books the filter lists, even without a file', async () => {
    renderBooksWithReader({ books: [reading(1), reading(2), reading(3, { file_formats: [] })] }, '/books');
    expect(await screen.findByRole('button', { name: 'Tutti i 3' })).toBeTruthy();
  });

  it('is hidden from a guest, who cannot open the files', async () => {
    renderBooksWithReader({ books: [reading(1)], role: 'guest' }, '/books');
    await screen.findAllByText('Libro 1');
    expect(screen.queryByRole('region', { name: 'In lettura' })).toBeNull();
  });

  it('reading_now_keeps_four_columns_with_one_book', async () => {
    renderBooksWithReader({ books: [reading(1), book(2)] }, '/books');
    const region = await screen.findByRole('region', { name: 'In lettura' });
    expect(within(region).getAllByRole('link')).toHaveLength(1);
    // jsdom has no layout: the row's rule is what gives each card a quarter of its width.
    const css = readFileSync(join(process.cwd(), 'src/modules/reading/ReadingNow.module.css'), 'utf8');
    const row = /\.row\s*{([^}]*)}/.exec(css)?.[1] ?? '';
    expect(row).toMatch(/grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
    expect(row).not.toMatch(/auto-fit|auto-fill/);
  });
});
