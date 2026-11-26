import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installIntersectionObserver, book } from './testkit';
import { ok } from '../../session/fixtures';
import { ISBN, METADATA, lookUp, openGroup, openNewBook, renderWithWrites, sent } from './writeKit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});
afterEach(() => vi.unstubAllGlobals());

const title = () => screen.getByRole('textbox', { name: 'Titolo' });

describe('ISBN step', () => {
  it('refuses a wrong check digit without calling the core', async () => {
    const { platform } = renderWithWrites({ books: [] });
    await openNewBook();
    await lookUp('9788845292614');
    expect(await screen.findByText(/L'ISBN non è valido/)).toBeInTheDocument();
    expect(sent(platform, 'GET', '/api/v1/lookup')).toHaveLength(0);
  });

  it('fills the form and names the providers that answered', async () => {
    const { platform } = renderWithWrites({ books: [] });
    await openNewBook();
    await lookUp('978-88-452-9261-3');
    expect(await screen.findByText(/Dati trovati da: Google Books, Open Library/)).toBeInTheDocument();
    expect(title()).toHaveValue('Il nome della rosa');
    expect(screen.getByRole('textbox', { name: 'Autore 1' })).toHaveValue('Umberto Eco');
    expect(screen.getByRole('textbox', { name: 'Editore' })).toHaveValue('Bompiani');
    expect(sent(platform, 'GET', `/api/v1/lookup/isbn/${ISBN}`)).toHaveLength(1);
  });

  it('keeps the typed ISBN on an empty form when nothing is found', async () => {
    renderWithWrites({ books: [] }, { [`GET /api/v1/lookup/isbn/${ISBN}`]: () => ({ status: 404, body: { error_code: 'isbn_not_found', message: 'x' } }) });
    await openNewBook();
    await lookUp();
    expect(await screen.findByText(/Nessun fornitore conosce questo ISBN/)).toBeInTheDocument();
    expect(title()).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'ISBN-13' })).toHaveValue(ISBN);
  });

  it('says so on rate_limited and leaves the form usable', async () => {
    renderWithWrites({ books: [] }, {
      [`GET /api/v1/lookup/isbn/${ISBN}`]: () => ({ status: 429, body: { error_code: 'rate_limited', message: 'x' }, retryAfter: 30 } as never),
    });
    await openNewBook();
    await lookUp();
    expect(await screen.findByText(/Riprova tra 30 secondi/)).toBeInTheDocument();
    await userEvent.type(title(), 'A mano');
    expect(title()).toHaveValue('A mano');
  });

  it('says so on a network error and leaves the form usable', async () => {
    renderWithWrites({ books: [] }, {
      [`GET /api/v1/lookup/isbn/${ISBN}`]: () => ({ status: 0, body: { error_code: 'network', message: 'x' } }),
    });
    await openNewBook();
    await lookUp();
    expect(await screen.findByText(/Impossibile raggiungere il server/)).toBeInTheDocument();
    expect(title()).toBeEnabled();
  });

  it('"Inserisci a mano" skips the search', async () => {
    const { platform } = renderWithWrites({ books: [] });
    await openNewBook();
    await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
    expect(title()).toHaveValue('');
    expect(sent(platform, 'GET', '/api/v1/lookup')).toHaveLength(0);
  });

  it('points at the copy of the book that is already in the library', async () => {
    renderWithWrites({ books: [book(5, { title: 'Già qui', isbn_13: ISBN })] });
    await openNewBook();
    await lookUp();
    const link = await screen.findByRole('link', { name: 'Apri il libro esistente' });
    expect(link).toHaveAttribute('href', expect.stringContaining('/books/b5'));
  });
});

describe('duplicate by either form of the ISBN', () => {
  it('finds the copy filed under the ISBN-10 when the ISBN-13 is looked up', async () => {
    renderWithWrites({ books: [book(5, { title: 'Già qui', isbn_10: '8845292614' })] });
    await openNewBook();
    await lookUp();
    const link = await screen.findByRole('link', { name: 'Apri il libro esistente' });
    expect(link).toHaveAttribute('href', expect.stringContaining('/books/b5'));
  });

  it('finds the copy filed under the ISBN-13 when the ISBN-10 is looked up', async () => {
    renderWithWrites(
      { books: [book(5, { title: 'Già qui', isbn_13: ISBN })] },
      { 'GET /api/v1/lookup/isbn/8845292614': () => ok(METADATA) },
    );
    await openNewBook();
    await lookUp('8845292614');
    expect(await screen.findByRole('link', { name: 'Apri il libro esistente' })).toHaveAttribute('href', expect.stringContaining('/books/b5'));
  });

  it('warns about an ISBN typed by hand once the typing paused', async () => {
    renderWithWrites({ books: [book(5, { title: 'Già qui', isbn_13: ISBN })] });
    await openNewBook();
    await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
    await openGroup('Edizione');
    await userEvent.type(screen.getByRole('textbox', { name: 'ISBN-10' }), '8845292614');
    expect(await screen.findByRole('link', { name: 'Apri il libro esistente' })).toHaveAttribute('href', expect.stringContaining('/books/b5'));
  });

  it('does not warn about an ISBN that is not in the library', async () => {
    const { platform } = renderWithWrites({ books: [book(5, { isbn_13: '9791032305690' })] });
    await openNewBook();
    await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
    await openGroup('Edizione');
    await userEvent.type(screen.getByRole('textbox', { name: 'ISBN-13' }), ISBN);
    await waitFor(() => expect(platform.calls.some((c) => c.path.includes('q=9788845292613'))).toBe(true));
    expect(screen.queryByRole('link', { name: 'Apri il libro esistente' })).toBeNull();
  });
});

describe('creation', () => {
  it('needs a title and sends nothing until there is one', async () => {
    const { platform } = renderWithWrites({ books: [] });
    await openNewBook();
    await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByText('Campo obbligatorio')).toBeInTheDocument();
    expect(title()).toHaveFocus();
    expect(sent(platform, 'POST', '/api/v1/books')).toHaveLength(0);
  });

  it('proposes the next progressive number and posts a body without empty fields', async () => {
    const { platform } = renderWithWrites({ books: [] });
    await openNewBook();
    await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
    await openGroup('Raccolta');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Numero progressivo' })).toHaveValue('7'));
    await userEvent.type(title(), '  Dune ');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(sent(platform, 'POST', '/api/v1/books')).toHaveLength(1));
    expect(sent(platform, 'POST', '/api/v1/books')[0]!.body).toEqual({ title: 'Dune', authors: [], progressive_number: 7 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('«Dune» aggiunto')).toBeInTheDocument();
  });

  it('shows a progressive-number conflict next to the field and keeps the form', async () => {
    renderWithWrites({ books: [] }, { 'POST /api/v1/books': () => ({ status: 409, body: { error_code: 'progressive_taken', message: 'x' } }) });
    await openNewBook();
    await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
    await userEvent.type(title(), 'Dune');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    const field = screen.getByRole('textbox', { name: 'Numero progressivo' });
    expect(await screen.findByText('Questo numero è già usato da un altro libro.')).toBeInTheDocument();
    expect(field).toHaveAccessibleDescription(/già usato/);
    expect(title()).toHaveValue('Dune');
  });

  it('"Salva e aggiungi un altro" keeps the panel open with an empty form', async () => {
    const { platform } = renderWithWrites({ books: [] });
    await openNewBook();
    await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
    await userEvent.type(title(), 'Dune');
    await userEvent.click(screen.getByRole('button', { name: 'Salva e aggiungi un altro' }));
    await waitFor(() => expect(sent(platform, 'POST', '/api/v1/books')).toHaveLength(1));
    const dialog = await screen.findByRole('dialog', { name: 'Nuovo libro' });
    expect(await within(dialog).findByRole('textbox', { name: 'ISBN' })).toHaveValue('');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Inserisci a mano' }));
    expect(title()).toHaveValue('');
  });

  it('"Salva e aggiungi un altro" keeps the focus inside the same dialog', async () => {
    renderWithWrites({ books: [] });
    await openNewBook();
    await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
    await userEvent.type(title(), 'Dune');
    await userEvent.click(screen.getByRole('button', { name: 'Salva e aggiungi un altro' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuovo libro' });
    const isbn = await within(dialog).findByRole('textbox', { name: 'ISBN' });
    await new Promise((r) => setTimeout(r, 50));
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(isbn).toHaveFocus();
  });
});
