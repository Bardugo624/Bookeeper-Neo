import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { book, installIntersectionObserver } from '../books/testkit';
import { openNewBook, renderWithWrites } from '../books/writeKit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});
afterEach(() => vi.unstubAllGlobals());

async function create(title: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Inserisci a mano' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Titolo' }), title);
  await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
}

describe('empty library', () => {
  it('invites a writer with three steps; the button opens "Nuovo libro"', async () => {
    renderWithWrites({ books: [] });
    expect(await screen.findByText('Aggiungi il primo libro per ISBN')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crea un mobile' })).toHaveAttribute('href', '/shelves');
    expect(screen.getByRole('link', { name: 'Collega il telefono o un altro computer' })).toHaveAttribute('href', '/devices');
    await userEvent.click(screen.getByRole('button', { name: 'Aggiungi il primo libro' }));
    expect(await screen.findByRole('dialog', { name: 'Nuovo libro' })).toBeInTheDocument();
  });

  it('shows the plain empty state without write permission', async () => {
    renderWithWrites({ books: [], role: 'guest' });
    expect(await screen.findByText('La libreria è ancora vuota.')).toBeInTheDocument();
    expect(screen.queryByText('Aggiungi il primo libro per ISBN')).not.toBeInTheDocument();
  });

  it('shows "Nessun risultato" with a filter, not the invitation', async () => {
    renderWithWrites({ books: [] }, {}, '/books?q=zzz');
    expect(await screen.findByText('Nessun risultato')).toBeInTheDocument();
    expect(screen.queryByText('Aggiungi il primo libro per ISBN')).not.toBeInTheDocument();
  });
});

describe('first book', () => {
  it('celebrates 0 → 1 once, with the title; "Aggiungine un altro" reopens the panel', async () => {
    renderWithWrites({ books: [] }, {}, '/books', { celebrate: true });
    await openNewBook();
    await create('Dune');
    const dialog = await screen.findByRole('dialog', { name: 'Il primo libro' });
    expect(dialog).toHaveTextContent('«Dune»');
    await userEvent.click(screen.getByRole('button', { name: 'Aggiungine un altro' }));
    expect(await screen.findByRole('dialog', { name: 'Nuovo libro' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Il primo libro' })).not.toBeInTheDocument();
  });

  it('"Vai alla libreria" closes it', async () => {
    renderWithWrites({ books: [] }, {}, '/books', { celebrate: true });
    await openNewBook();
    await create('Dune');
    await screen.findByRole('dialog', { name: 'Il primo libro' });
    await userEvent.click(screen.getByRole('button', { name: 'Vai alla libreria' }));
    expect(screen.queryByRole('dialog', { name: 'Il primo libro' })).not.toBeInTheDocument();
  });

  it('says nothing from 1 to 2', async () => {
    renderWithWrites({ books: [book(1)] });
    await openNewBook();
    await create('Secondo');
    await screen.findByText(/Secondo/);
    expect(screen.queryByRole('dialog', { name: 'Il primo libro' })).not.toBeInTheDocument();
  });

  it('says nothing the second time on the same connection, but does on another', async () => {
    const first = renderWithWrites({ books: [] }, {}, '/books', { celebrate: true });
    await openNewBook();
    await create('Dune');
    await userEvent.click(await screen.findByRole('button', { name: 'Vai alla libreria' }));
    first.unmount();
    // Same connection, library emptied again: nothing.
    const second = renderWithWrites({ books: [] }, {}, '/books', { celebrate: true });
    await openNewBook();
    await create('Dune');
    await screen.findByText('«Dune» aggiunto');
    expect(screen.queryByRole('dialog', { name: 'Il primo libro' })).not.toBeInTheDocument();
    second.unmount();
    // Another connection: celebrates.
    localStorage.clear();
    localStorage.setItem('bookeeper.onboarding.firstBook.other', '1');
    renderWithWrites({ books: [] }, {}, '/books', { celebrate: true });
    await openNewBook();
    await create('Dune');
    expect(await screen.findByRole('dialog', { name: 'Il primo libro' })).toBeInTheDocument();
  });
});
