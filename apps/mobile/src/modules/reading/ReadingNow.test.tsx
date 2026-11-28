import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ME, ok } from '../../session/fixtures';
import { book, renderSearch } from '../search/testkit';

const reading = (i: number, over = {}) =>
  book(i, {
    file_formats: ['epub'],
    updated_at: 1000 + i,
    reading: { status: 'reading', progress_percent: i * 10, current_page: null },
    ...over,
  });

describe('«In lettura» in Cerca', () => {
  it('reading_now_shows_only_with_an_empty_field', async () => {
    const books = [reading(1), book(2)];
    const { unmount } = renderSearch({ api: { books }, route: '/search' });
    expect(await screen.findByRole('region', { name: 'In lettura' })).toBeTruthy();
    unmount();

    renderSearch({ api: { books }, route: '/search?q=libro' });
    await screen.findAllByText('Libro 1');
    expect(screen.queryByRole('region', { name: 'In lettura' })).toBeNull();
  });

  it('is hidden with a filter, for a guest, and with nothing to continue', async () => {
    const { unmount } = renderSearch({ api: { books: [reading(1)] }, route: '/search?reading=reading' });
    await screen.findAllByText('Libro 1');
    expect(screen.queryByRole('region', { name: 'In lettura' })).toBeNull();
    unmount();

    const guest = renderSearch({
      api: {
        books: [reading(1)],
        override: (c) => (c.path === '/api/v1/me' ? ok({ ...ME, user: { ...ME.user, role: 'guest' } }) : undefined),
      },
    });
    await screen.findAllByText('Libro 1');
    expect(screen.queryByRole('region', { name: 'In lettura' })).toBeNull();
    guest.unmount();

    renderSearch({ api: { books: [reading(1, { file_formats: [] }), book(2)] } });
    await screen.findAllByText('Libro 2');
    expect(screen.queryByRole('region', { name: 'In lettura' })).toBeNull();
  });

  it('reading_now_is_recent_first', async () => {
    const books = [reading(1), reading(2), reading(3), reading(4, { file_formats: [] }), book(5)];
    renderSearch({ api: { books, readOrder: ['b2', 'b3', 'b1'] } });
    const region = await screen.findByRole('region', { name: 'In lettura' });
    const titles = within(region).getAllByRole('link').map((l) => within(l).getByText(/^Libro/).textContent);
    expect(titles).toEqual(['Libro 2', 'Libro 3', 'Libro 1']);
    expect(within(region).getAllByRole('progressbar')[0]!.getAttribute('aria-valuenow')).toBe('20');
    expect(within(region).getByText('20%')).toBeTruthy();
  });

  it('a_cover_opens_the_reader', async () => {
    renderSearch({ api: { books: [reading(1)] } });
    const region = await screen.findByRole('region', { name: 'In lettura' });
    await userEvent.click(within(region).getByRole('link'));
    expect((await screen.findByTestId('reader-probe')).textContent).toBe('reader b1');
  });
});
