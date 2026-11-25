import { screen, waitFor, within } from '@testing-library/react';
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

describe('placeholder color', () => {
  const group = () => screen.getByRole('radiogroup', { name: 'Colore del segnaposto' });
  const swatch = (name: string) => within(group()).getByRole('radio', { name });

  it('sends the chosen swatch as cover_color when creating', async () => {
    const { platform } = await manualForm();
    expect(swatch('Automatico')).toBeChecked();
    await userEvent.click(swatch('Prugna'));
    expect(swatch('Prugna')).toBeChecked();
    expect(swatch('Automatico')).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(sent(platform, 'POST', '/api/v1/books')).toHaveLength(1));
    expect(sent(platform, 'POST', '/api/v1/books')[0]!.body).toMatchObject({ title: 'Dune', cover_color: '#6b3a5f' });
  });

  it('leaves the field out when creating with "Automatico"', async () => {
    const { platform } = await manualForm();
    await userEvent.click(swatch('Prugna'));
    await userEvent.click(swatch('Automatico'));
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(sent(platform, 'POST', '/api/v1/books')).toHaveLength(1));
    expect(sent(platform, 'POST', '/api/v1/books')[0]!.body).not.toHaveProperty('cover_color');
  });

  it('patches the color of a book, and clears it with "Automatico"', async () => {
    const { platform } = renderWithWrites({ books: [stored({ cover_color: '#6b3a5f' })] }, {}, '/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica' }));
    expect(await screen.findByRole('radio', { name: 'Prugna' })).toBeChecked();
    await userEvent.click(swatch('Muschio'));
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(sent(platform, 'PATCH', '/api/v1/books/b1')).toHaveLength(1));
    expect(sent(platform, 'PATCH', '/api/v1/books/b1')[0]!.body).toEqual({ cover_color: '#5a6b3a' });
  });

  it('sends null when an edited book goes back to "Automatico"', async () => {
    const { platform } = renderWithWrites({ books: [stored({ cover_color: '#6b3a5f' })] }, {}, '/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica' }));
    await userEvent.click(await screen.findByRole('radio', { name: 'Prugna' }));
    await userEvent.click(swatch('Automatico'));
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(sent(platform, 'PATCH', '/api/v1/books/b1')).toHaveLength(1));
    expect(sent(platform, 'PATCH', '/api/v1/books/b1')[0]!.body).toEqual({ cover_color: null });
  });

  it('moves the choice with the arrow keys', async () => {
    await manualForm();
    swatch('Automatico').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(swatch('Salvia')).toBeChecked();
    expect(swatch('Salvia')).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}{ArrowLeft}');
    expect(swatch('Automatico')).toBeChecked();
    await userEvent.keyboard('{ArrowLeft}');
    expect(swatch('Terra d\'ombra')).toBeChecked();
  });

  it('has a name on every swatch and one tab stop', async () => {
    await manualForm();
    const radios = within(group()).getAllByRole('radio');
    expect(radios).toHaveLength(11);
    for (const r of radios) expect(r).toHaveAccessibleName();
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });
});

describe('removing a cover that is not stored', () => {
  it('sends no DELETE for a new book whose chosen cover was removed', async () => {
    const { platform } = await manualForm();
    await userEvent.upload(fileInput(), png());
    await userEvent.click(await screen.findByRole('button', { name: 'Rimuovi' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(sent(platform, 'POST', '/api/v1/books')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(platform.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
  });

  it('sends no DELETE for an existing book that had no cover', async () => {
    const { platform } = renderWithWrites({ books: [stored()] }, {}, '/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica' }));
    await userEvent.upload(fileInput(), png());
    await userEvent.click(await screen.findByRole('button', { name: 'Rimuovi' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(platform.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
  });
});
