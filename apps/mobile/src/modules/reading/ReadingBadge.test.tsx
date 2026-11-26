import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderSearch } from '../search/testkit';
import { book } from '../search/testkit';
import { ReadingBadge } from './ReadingBadge';

describe('list row', () => {
  it('shows a ring with the percent while reading', async () => {
    renderSearch({ api: { books: [book(1, { page_count: 200, reading: { status: 'reading', current_page: 50 } })] } });
    const ring = await screen.findByRole('progressbar', { name: 'In lettura, 25%' });
    expect(ring.textContent).toContain('25%');
  });

  it('shows a tick once read', async () => {
    renderSearch({ api: { books: [book(1, { reading: { status: 'read' } })] } });
    expect(await screen.findByRole('img', { name: 'Letto' })).toBeTruthy();
  });

  it.each(['to_read', 'abandoned'])('shows nothing for %s', async (status) => {
    renderSearch({ api: { books: [book(1, { reading: { status } })] } });
    await screen.findByText('Libro 1');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows nothing without a state', () => {
    const { container } = render(<ReadingBadge reading={null} pageCount={10} />);
    expect(container.firstChild).toBeNull();
  });
});
