import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { file, recordReader, setup, SHA, shown, type ReaderProps } from './testkit';

vi.mock('@bookeeper/reader/app', () => ({ ReaderApp: (p: ReaderProps) => recordReader(p) }));

beforeEach(() => {
  shown.props = null;
  document.title = 'Bookeeper';
});

describe('the reader route', () => {
  it('the_reader_route_has_no_sidebar', async () => {
    setup();
    await screen.findByTestId('reader');
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(document.querySelector('nav')).toBeNull();
  });

  it('mounts the reader for the desktop with the book, the file and its hash', async () => {
    const { raw } = setup({ files: [file('f1', 'epub'), file('f2', 'pdf')] });
    await screen.findByTestId('reader');
    const p = shown.props!;
    expect(p.platform).toBe('desktop');
    expect(p.book).toEqual({ id: 'b1', title: 'Il nome della rosa', authors: ['Umberto Eco'] });
    expect(p.file).toMatchObject({ id: 'f1', sha256: SHA, format: 'epub' });
    // The hash is the file's ETag, asked with a one byte range.
    expect(raw[0]).toMatchObject({ method: 'GET', path: '/api/v1/books/b1/files/f1/content', headers: { Range: 'bytes=0-0' } });
  });

  it('opens the file named by ?file', async () => {
    setup({ files: [file('f1', 'epub'), file('f2', 'pdf')], route: '/read/b1?file=f2' });
    await screen.findByTestId('reader');
    expect(shown.props!.file.id).toBe('f2');
  });

  it('guests_go_back_to_the_book', async () => {
    const { raw } = setup({ role: 'guest' });
    expect(await screen.findByRole('heading', { name: 'Scheda del libro' })).toBeInTheDocument();
    expect(shown.props).toBeNull();
    expect(raw).toHaveLength(0);
  });

  it('the_window_title_is_the_book', async () => {
    const { unmount } = setup();
    await screen.findByTestId('reader');
    expect(document.title).toBe('Il nome della rosa');
    unmount();
    expect(document.title).toBe('Bookeeper');
  });

  it('the_top_bar_has_the_window_controls', async () => {
    const { platform } = setup();
    await screen.findByTestId('reader');
    expect(screen.getByRole('button', { name: 'Riduci a icona' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ingrandisci' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(platform.windowCalls).toContain('close');
  });

  it('closing the reader goes back to the book page', async () => {
    const { router } = setup();
    await screen.findByTestId('reader');
    await userEvent.click(screen.getByRole('button', { name: 'chiudi lettore' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/books/b1'));
  });

  it('says so when the book has no file to read, with a way back', async () => {
    setup({ files: [] });
    expect(await screen.findByText('Questo libro non ha un file da leggere')).toBeInTheDocument();
    expect(shown.props).toBeNull();
    expect(screen.getByRole('button', { name: 'Torna al libro' })).toBeInTheDocument();
  });

  it('says so when the file cannot be identified', async () => {
    setup({ etag: '' });
    expect(await screen.findByText('Non riesco ad aprire il libro')).toBeInTheDocument();
    expect(shown.props).toBeNull();
  });
});
