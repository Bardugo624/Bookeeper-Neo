import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installIntersectionObserver } from './testkit';
import { lookUp, openNewBook, renderWithWrites, sent, stored } from './writeKit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
});
afterEach(() => vi.unstubAllGlobals());

const fileInput = () => screen.getByLabelText('File della copertina');
const png = (size = 10) => {
  const file = new File(['x'], 'c.png', { type: 'image/png' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

async function manualForm(lib = {}) {
  const view = renderWithWrites({ books: [], ...lib });
  await openNewBook();
  await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Titolo' }), 'Dune');
  return view;
}

describe('cover in the form', () => {
  it('uses the cover the lookup offered, through the core fetch route', async () => {
    const { platform } = renderWithWrites({ books: [] });
    await openNewBook();
    await lookUp();
    await userEvent.click(await screen.findByRole('button', { name: 'Usa questa copertina' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(sent(platform, 'POST', '/api/v1/books/new/cover/fetch')).toHaveLength(1));
    expect(sent(platform, 'POST', '/api/v1/books/new/cover/fetch')[0]!.body).toEqual({
      candidates: ['https://covers.example/rosa.jpg'],
    });
  });

  it('uploads a chosen file as raw bytes', async () => {
    const raw: Array<{ method: string; path: string; bytes?: Uint8Array }> = [];
    await manualForm({ raw });
    await userEvent.upload(fileInput(), png());
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(raw).toHaveLength(1));
    expect(raw[0]!.path).toBe('/api/v1/books/new/cover');
  });

  it('refuses a wrong type or a file over 5 MB before sending anything', async () => {
    const raw: Array<{ method: string; path: string }> = [];
    await manualForm({ raw });
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(fileInput(), new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('Sono ammesse solo immagini JPEG, PNG o WebP.')).toBeInTheDocument();
    await user.upload(fileInput(), png(5 * 1024 * 1024 + 1));
    expect(await screen.findByText("L'immagine supera i 5 MB.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(raw).toHaveLength(0);
  });

  it('removes the stored cover of an edited book', async () => {
    const cover = { bytes: new Uint8Array([1]), etag: '"e"' };
    const { platform } = renderWithWrites(
      { books: [stored({ cover_color: '#123456' })], cover },
      { 'DELETE /api/v1/books/b1/cover': () => ({ status: 204, body: undefined }) },
      '/books/b1',
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rimuovi' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(sent(platform, 'DELETE', '/api/v1/books/b1/cover')).toHaveLength(1));
    expect(sent(platform, 'PATCH', '/api/v1/books/b1')).toHaveLength(0);
  });
});
