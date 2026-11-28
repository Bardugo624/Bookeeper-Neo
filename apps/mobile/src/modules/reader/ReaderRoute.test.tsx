import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { file, renderReader } from './testkit';

vi.mock('@bookeeper/reader/app', async () => ({ ReaderApp: (await import('./stubReader')).StubReaderApp }));

afterEach(() => {
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
});

describe('the reader route', () => {
  it('the_reader_route_has_no_tab_bar', async () => {
    const view = renderReader({ route: '/books/b1' });
    expect(await screen.findByText('Scheda del libro')).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    void view.router.navigate('/read/b1');
    expect(await screen.findByTestId('reader')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByTestId('reader')).toHaveAttribute('data-platform', 'phone');
  });

  it('picks_the_epub_first', async () => {
    renderReader({ files: [file('p', 'pdf', { created_at: 1 }), file('m', 'mobi', { created_at: 2 }), file('e2', 'epub', { created_at: 9 }), file('e1', 'epub', { created_at: 5 })] });
    expect(await screen.findByTestId('reader')).toHaveAttribute('data-file', 'e1');
  });

  it('opens_the_file_the_link_names', async () => {
    renderReader({ files: [file('e1', 'epub'), file('p', 'pdf')], route: '/read/b1?file=p' });
    expect(await screen.findByTestId('reader')).toHaveAttribute('data-file', 'p');
  });

  it('who_cannot_read_goes_back_to_the_book', async () => {
    const view = renderReader({ role: 'guest' });
    expect(await screen.findByText('Scheda del libro')).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/books/b1');
    expect(screen.queryByTestId('reader')).toBeNull();
  });

  it('a_book_without_a_file_goes_back_to_the_book', async () => {
    const view = renderReader({ files: [] });
    expect(await screen.findByText('Scheda del libro')).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe('/books/b1');
  });

  it('a_failed_listing_offers_a_retry', async () => {
    renderReader({ listing: { status: 500, body: { error_code: 'internal', message: 'x' } } });
    expect(await screen.findByRole('button', { name: /riprova/i })).toBeInTheDocument();
  });

  it('theme_color_follows_the_page_and_comes_back', async () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#123456';
    document.head.append(meta);
    localStorage.setItem('bookeeper.reader.settings', JSON.stringify({ theme: 'sepia' }));
    const view = renderReader();
    await screen.findByTestId('reader');
    await waitFor(() => expect(meta.content).toBe('#f2e8d9'));
    // A change of theme inside the reader moves the bar with it.
    screen.getByTestId('reader').setAttribute('data-theme', 'black');
    await waitFor(() => expect(meta.content).toBe('#000000'));
    await view.router.navigate('/books/b1');
    await screen.findByText('Scheda del libro');
    expect(meta.content).toBe('#123456');
    localStorage.removeItem('bookeeper.reader.settings');
  });
});
