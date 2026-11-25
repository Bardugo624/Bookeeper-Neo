import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installIntersectionObserver, makeDb } from './testkit';
import { book } from './testkit';
import { renderWithWrites, sent, stored } from './writeKit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});
afterEach(() => vi.unstubAllGlobals());

describe('edit', () => {
  it('sends a PATCH with only the changed fields', async () => {
    const { platform } = renderWithWrites({ books: [stored()] }, {
      'PATCH /api/v1/books/b1': (r) => ({ status: 200, body: { ...stored(), ...(r.body as object) } }),
    }, '/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica' }));
    const title = await screen.findByRole('textbox', { name: 'Titolo' });
    expect(title).toHaveValue('Dune');
    await userEvent.clear(title);
    await userEvent.type(title, 'Dune Messia');
    await userEvent.clear(screen.getByRole('textbox', { name: 'Editore' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(sent(platform, 'PATCH', '/api/v1/books/b1')).toHaveLength(1));
    expect(sent(platform, 'PATCH', '/api/v1/books/b1')[0]!.body).toEqual({ title: 'Dune Messia', publisher: null });
  });

  it('sends nothing when nothing changed', async () => {
    const { platform } = renderWithWrites({ books: [stored()] }, {}, '/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(platform.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });
});

describe('book page', () => {
  it('"Presta" opens the loan dialog for this book', async () => {
    renderWithWrites({ books: [stored()] }, {}, '/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Presta' }));
    expect(await screen.findByRole('dialog', { name: 'Nuovo prestito' })).toBeInTheDocument();
  });

  it('shows to whom a book on loan went, with a link to its loans, and no "Presta"', async () => {
    const loan = { id: 'l1', book_id: 'b1', book_title: 'Dune', book_authors: [], borrower_name: 'Marta', lent_at: 1_700_000_000, overdue: false };
    renderWithWrites({ books: [stored({ on_loan: true })] }, {
      'GET /api/v1/loans': () => ({ status: 200, body: { items: [loan], total: 1 } }),
    }, '/books/b1');
    const card = await screen.findByRole('region', { name: 'Prestiti' });
    expect(await within(card).findByText(/Marta/)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Vedi i prestiti' })).toHaveAttribute('href', expect.stringContaining('/loans?book=b1'));
    expect(screen.queryByRole('button', { name: 'Presta' })).toBeNull();
  });

  it('links "Dove si trova" to the shelf', async () => {
    renderWithWrites({ books: [stored({ placement: { shelf_id: 's1', row_index: 0, slot_index: 0 } })] }, {}, '/books/b1');
    const link = await screen.findByRole('link', { name: 'Mostra sullo scaffale' });
    expect(link).toHaveAttribute('href', expect.stringContaining('/shelves?unit=s1&book=b1'));
  });

  it('deletes after a confirmation, goes back to the list and says so', async () => {
    const { platform, router } = renderWithWrites({ books: [stored()] }, {
      'DELETE /api/v1/books/b1': () => ({ status: 204, body: undefined }),
    }, '/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Altro' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Elimina' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminare «Dune»?' });
    expect(sent(platform, 'DELETE', '/api/v1/books/b1')).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Elimina' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/books'));
    expect(await screen.findByText('«Dune» eliminato')).toBeInTheDocument();
    expect(sent(platform, 'DELETE', '/api/v1/books/b1')).toHaveLength(1);
  });
});

describe('selection', () => {
  const checkbox = (n: number) => screen.getByRole('checkbox', { name: `Seleziona «Libro ${n}»` });

  async function select(books = makeDb(6), routes: Parameters<typeof renderWithWrites>[1] = {}) {
    const view = renderWithWrites({ books }, routes);
    await screen.findByRole('link', { name: 'Libro 1, Autore 1' });
    await userEvent.click(screen.getByRole('button', { name: 'Seleziona' }));
    return view;
  }

  it('selects a range with Shift-click', async () => {
    await select();
    // One user-event instance, so the held Shift key reaches the click.
    const user = userEvent.setup();
    await user.click(checkbox(2));
    await user.keyboard('{Shift>}');
    await user.click(checkbox(5));
    await user.keyboard('{/Shift}');
    for (const n of [2, 3, 4, 5]) expect(checkbox(n)).toBeChecked();
    expect(checkbox(1)).not.toBeChecked();
    expect(checkbox(6)).not.toBeChecked();
    expect(screen.getByText('4 selezionati')).toBeInTheDocument();
  });

  it('selects every loaded book with Ctrl A', async () => {
    await select();
    await userEvent.keyboard('{Control>}a{/Control}');
    expect(screen.getByText('6 selezionati')).toBeInTheDocument();
  });

  it('works in the list view with a column of checkboxes', async () => {
    renderWithWrites({ books: makeDb(3) }, {}, '/books?view=list');
    await screen.findByRole('link', { name: 'Libro 1' });
    await userEvent.click(screen.getByRole('button', { name: 'Seleziona' }));
    await userEvent.click(checkbox(1));
    expect(screen.getByText('1 selezionato')).toBeInTheDocument();
  });

  it('confirms with the number, then reports a partial result', async () => {
    const { platform } = await select(makeDb(6), {
      'POST /api/v1/books/batch-delete': () => ({ status: 200, body: { deleted: 2 } }),
    });
    await userEvent.click(checkbox(1));
    await userEvent.click(checkbox(2));
    await userEvent.click(checkbox(3));
    await userEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eliminare 3 libri?' });
    expect(sent(platform, 'POST', '/api/v1/books/batch-delete')).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Elimina 3 libri' }));
    await waitFor(() => expect(sent(platform, 'POST', '/api/v1/books/batch-delete')).toHaveLength(1));
    expect(sent(platform, 'POST', '/api/v1/books/batch-delete')[0]!.body).toEqual({ ids: ['b1', 'b2', 'b3'] });
    expect(await screen.findByText('Eliminati 2 libri su 3')).toBeInTheDocument();
    expect(screen.getByText('1 libro non è stato eliminato.')).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByText(/selezionat/)).toBeNull();
  });

  // The fake core answers the whole library at once, so Ctrl A selects all 1200.
  const all = makeDb(1200);
  const everyBook = { 'GET /api/v1/books': () => ({ status: 200, body: { items: all, total: all.length } }) };

  it('deletes 1,200 books in blocks of 500, one after the other', async () => {
    const sizes: number[] = [];
    const { platform } = await select(all, {
      ...everyBook,
      'POST /api/v1/books/batch-delete': (r) => {
        const n = (r.body as { ids: string[] }).ids.length;
        sizes.push(n);
        return { status: 200, body: { deleted: n } };
      },
    });
    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    const dialog = await screen.findByRole('dialog', { name: /Eliminare 1.?200 libri\?/ });
    await userEvent.click(within(dialog).getByRole('button', { name: /Elimina 1.?200 libri/ }));
    expect(await screen.findByText(/1.?200 libri eliminati/)).toBeInTheDocument();
    expect(sizes).toEqual([500, 500, 200]);
    expect(sent(platform, 'POST', '/api/v1/books/batch-delete')).toHaveLength(3);
  });

  it('stops at the failed block and says how many went through', async () => {
    let calls = 0;
    const { platform } = await select(all, {
      ...everyBook,
      'POST /api/v1/books/batch-delete': (r) => {
        calls += 1;
        const n = (r.body as { ids: string[] }).ids.length;
        return calls === 2 ? { status: 500, body: { error_code: 'internal', message: 'x' } } : { status: 200, body: { deleted: n } };
      },
    });
    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    const dialog = await screen.findByRole('dialog', { name: /Eliminare 1.?200 libri\?/ });
    await userEvent.click(within(dialog).getByRole('button', { name: /Elimina 1.?200 libri/ }));
    expect(await screen.findByText(/Eliminati 500 libri su 1.?200/)).toBeInTheDocument();
    expect(sent(platform, 'POST', '/api/v1/books/batch-delete')).toHaveLength(2);
  });

  it('"Annulla" leaves the mode without deleting', async () => {
    const { platform } = await select();
    await userEvent.click(checkbox(1));
    await userEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(sent(platform, 'POST', '/api/v1/books/batch-delete')).toHaveLength(0);
  });
});

describe('labels', () => {
  it('the selection bar opens the labels dialog with the selected ids', async () => {
    const { platform } = renderWithWrites({ books: [stored(), book(2)] });
    await userEvent.click(await screen.findByRole('button', { name: 'Seleziona' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Seleziona «Dune»' }));
    await userEvent.click(screen.getByRole('button', { name: 'Etichette' }));
    const dialog = await screen.findByRole('dialog', { name: 'Etichette' });
    expect(within(dialog).getByText('1 libro')).toBeInTheDocument();
    expect(platform.calls.filter((c) => c.path.endsWith('/labels/pdf'))).toHaveLength(0);
  });

  it('the book page "Altro" menu has "Etichetta"', async () => {
    renderWithWrites({ books: [stored()] }, {}, '/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Altro' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Etichetta' }));
    expect(await screen.findByRole('dialog', { name: 'Etichette' })).toBeInTheDocument();
  });
});
