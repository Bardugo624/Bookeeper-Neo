import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { book, installIntersectionObserver, renderBooks } from './testkit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});

describe('BookCard ring', () => {
  it('uses progress_percent when there is one', async () => {
    renderBooks({ books: [book(1, { page_count: 100, reading: { status: 'reading', current_page: 50, rating: null, progress_percent: 37 } })] });
    expect(await screen.findByRole('progressbar', { name: /37%/ })).toBeInTheDocument();
  });

  it('the_cover_ring_has_no_disc_under_it', () => {
    const css = readFileSync(join(process.cwd(), 'src/modules/books/BookCard.module.css'), 'utf8');
    const rule = /\.ring\s*\{([^}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? '';
    expect(rule).not.toMatch(/background/);
    expect(rule).not.toMatch(/box-shadow/);
    expect(rule).toMatch(/drop-shadow\(/);
  });
});
