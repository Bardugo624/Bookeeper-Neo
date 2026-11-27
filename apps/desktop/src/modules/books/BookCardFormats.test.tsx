import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { book, installIntersectionObserver, renderBooks } from './testkit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});

describe('format label on the card', () => {
  it('shows the formats of the attached files', async () => {
    renderBooks({ books: [book(1, { title: 'Con file', file_formats: ['epub', 'pdf'] }), book(2, { title: 'Senza file' })] });
    const withFiles = (await screen.findByRole('link', { name: /Con file/ })).closest('li')!;
    expect(within(withFiles).getByText('EPUB · PDF')).toBeInTheDocument();
    const without = screen.getByRole('link', { name: /Senza file/ }).closest('li')!;
    expect(without.textContent).not.toMatch(/EPUB|PDF/);
  });
});
