import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderSearch } from '../search/testkit';
import { book } from '../search/testkit';
import { ReadingBadge } from './ReadingBadge';

describe('list row', () => {
  it('shows a ring with the percent while reading', async () => {
    renderSearch({ api: { books: [book(1, { page_count: 200, reading: { status: 'reading', current_page: 50, rating: null, progress_percent: null } })] } });
    const ring = await screen.findByRole('progressbar', { name: 'In lettura, 25%' });
    expect(ring.textContent).toContain('25%');
  });

  it('uses the percent of the summary when there is one', async () => {
    renderSearch({ api: { books: [book(1, { page_count: null, reading: { status: 'reading', rating: null, progress_percent: 37 } })] } });
    const ring = await screen.findByRole('progressbar');
    expect(ring.getAttribute('aria-valuenow')).toBe('37');
  });

  it('shows a tick once read', async () => {
    renderSearch({ api: { books: [book(1, { reading: { status: 'read', rating: null, progress_percent: null } })] } });
    expect(await screen.findByRole('img', { name: 'Letto' })).toBeTruthy();
  });

  it.each(['to_read', 'abandoned'])('shows nothing for %s', async (status) => {
    renderSearch({ api: { books: [book(1, { reading: { status, rating: null, progress_percent: null } })] } });
    await screen.findByText('Libro 1');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows nothing without a state', () => {
    const { container } = render(<ReadingBadge reading={null} pageCount={10} />);
    expect(container.firstChild).toBeNull();
  });
});
