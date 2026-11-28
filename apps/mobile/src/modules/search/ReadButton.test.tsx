import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ME, ok } from '../../session/fixtures';
import { book, renderSearch } from './testkit';

function open(over: Parameters<typeof book>[1], role = 'owner') {
  return renderSearch({
    api: {
      books: [book(1, { id: 'b1', title: 'Dune', ...over })],
      override: (call) => (call.path === '/api/v1/me' ? ok({ ...ME, user: { ...ME.user, role } }) : undefined),
    },
    route: '/books/b1',
  });
}

describe('«Leggi» on the book page', () => {
  it('read_shows_only_for_who_can_read_files', async () => {
    const { unmount } = open({ file_formats: ['epub'] });
    expect(await screen.findByRole('link', { name: 'Leggi' })).toBeTruthy();
    unmount();

    const guest = open({ file_formats: ['epub'] }, 'guest');
    await screen.findByRole('heading', { level: 2, name: 'Dune' });
    expect(screen.queryByRole('link', { name: /^Leggi/ })).toBeNull();
    guest.unmount();

    open({ file_formats: [] });
    await screen.findByRole('heading', { level: 2, name: 'Dune' });
    expect(screen.queryByRole('link', { name: /^Leggi/ })).toBeNull();
  });

  it('read_says_the_percent', async () => {
    open({ file_formats: ['epub'], reading: { status: 'reading', progress_percent: 4, current_page: null } });
    expect(await screen.findByRole('link', { name: 'Leggi · 4%' })).toBeTruthy();
  });

  it('opens the reader on the book', async () => {
    open({ file_formats: ['epub'] });
    await userEvent.click(await screen.findByRole('link', { name: 'Leggi' }));
    expect((await screen.findByTestId('reader-probe')).textContent).toBe('reader b1');
  });
});
