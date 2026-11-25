import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '../../session/fixtures';
import { TAGS, tagHandler } from '../tags/testkit';
import { book, installIntersectionObserver, listCalls, makeDb, renderBooks } from './testkit';
import { lookUp, openNewBook, renderWithWrites, sent } from './writeKit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});
afterEach(() => vi.unstubAllGlobals());

const fantasy = { id: 't1', name: 'Fantasy', color: 'plum' };
const tagged = (i = 1) => book(i, { title: 'Dune', tags: [fantasy] });
const puts = (platform: Parameters<typeof sent>[0]) => platform.calls.filter((c) => c.method === 'PUT' && c.path.endsWith('/tags'));

describe('book page', () => {
  it('shows the tags as chips that lead to the filtered list', async () => {
    const state = { tags: [...TAGS] };
    const { platform, router } = renderBooks({ books: [tagged()], extra: tagHandler(state) }, '/books/b1');
    const region = await screen.findByRole('region', { name: 'Tag' });
    const chip = within(region).getByRole('link', { name: 'Fantasy' });
    expect(chip).toHaveAttribute('href', '/books?tag=t1');
    await userEvent.click(chip);
    await waitFor(() => expect(router.state.location.search).toBe('?tag=t1'));
    await waitFor(() => expect(listCalls(platform).some((p) => p.getAll('tag_id').join() === 't1')).toBe(true));
  });

  it('"Modifica tag" saves the whole set with one PUT', async () => {
    const state = { tags: [...TAGS] };
    const { platform } = renderBooks({ books: [tagged()], extra: tagHandler(state) }, '/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica tag' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifica tag' });
    await userEvent.type(within(dialog).getByRole('combobox', { name: 'Tag' }), 'class');
    await userEvent.keyboard('{Enter}');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(puts(platform)).toHaveLength(1));
    expect(puts(platform)[0]).toMatchObject({ path: '/api/v1/books/b1/tags', body: { tag_ids: ['t1', 't2'] } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('sends nothing when the set did not change', async () => {
    const state = { tags: [...TAGS] };
    const { platform } = renderBooks({ books: [tagged()], extra: tagHandler(state) }, '/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica tag' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modifica tag' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(puts(platform)).toHaveLength(0);
  });

  it('is read-only without write permission', async () => {
    const state = { tags: [...TAGS] };
    renderBooks({ books: [tagged()], role: 'guest', extra: tagHandler(state) }, '/books/b1');
    const region = await screen.findByRole('region', { name: 'Tag' });
    expect(within(region).getByRole('link', { name: 'Fantasy' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modifica tag' })).toBeNull();
  });
});

describe('list', () => {
  it('reads ?tag= and sends it as tag_id', async () => {
    const other = book(2, { title: 'Altro' });
    const { platform } = renderBooks({ books: [tagged(1), other] }, '/books?tag=t1');
    await screen.findByRole('link', { name: 'Dune, Autore 1' });
    expect(screen.queryByRole('link', { name: /Altro/ })).toBeNull();
    expect(listCalls(platform).filter((p) => p.get('limit') === '60').map((p) => p.getAll('tag_id'))).toEqual([['t1']]);
  });

  it('adds a "Tag" column in the list view and no chips in the grid', async () => {
    const { unmount } = renderBooks({ books: [tagged()] }, '/books?view=list');
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Tag' })).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Fantasy' })).toBeInTheDocument();
    unmount();
    renderBooks({ books: [tagged()] }, '/books?view=grid');
    await screen.findByRole('link', { name: 'Dune, Autore 1' });
    expect(screen.queryByRole('link', { name: 'Fantasy' })).toBeNull();
  });
});

describe('manage tags', () => {
  const open = async (state: { tags: typeof TAGS }, role?: 'guest') => {
    const view = renderBooks({ books: makeDb(1), role, extra: tagHandler(state) });
    await userEvent.click(await screen.findByRole('button', { name: 'Altro' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Gestisci tag' }));
    const dialog = await screen.findByRole('dialog', { name: 'Gestisci tag' });
    await within(dialog).findByRole('textbox', { name: 'Nome di «Fantasy»' });
    return { ...view, dialog };
  };
  const patches = (platform: { calls: Array<{ method: string }> }) => platform.calls.filter((c) => c.method === 'PATCH');

  it('lists the tags with their book count', async () => {
    const { dialog } = await open({ tags: [...TAGS] });
    expect(within(dialog).getAllByText('3 libri')).toHaveLength(1);
    expect(within(dialog).getByText('1 libro')).toBeInTheDocument();
  });

  it('renames a tag', async () => {
    const { dialog, platform } = await open({ tags: [...TAGS] });
    const name = within(dialog).getByRole('textbox', { name: 'Nome di «Fantasy»' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Fantascienza{Enter}');
    await waitFor(() => expect(patches(platform)).toHaveLength(1));
    expect(patches(platform)[0]).toMatchObject({ path: '/api/v1/tags/t1', body: { name: 'Fantascienza' } });
    expect(await within(dialog).findByRole('textbox', { name: 'Nome di «Fantascienza»' })).toBeInTheDocument();
  });

  it('shows tag_exists next to the field', async () => {
    const { dialog } = await open({ tags: [...TAGS] });
    const name = within(dialog).getByRole('textbox', { name: 'Nome di «Fantasy»' });
    await userEvent.clear(name);
    await userEvent.type(name, 'classici');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salva il nome di «Fantasy»' }));
    expect(await within(dialog).findByText('Esiste già un tag con questo nome.')).toBeInTheDocument();
    expect(name).toHaveAccessibleDescription('Esiste già un tag con questo nome.');
  });

  it('changes the color', async () => {
    const { dialog, platform } = await open({ tags: [...TAGS] });
    const group = within(dialog).getByRole('radiogroup', { name: 'Colore di «Fantasy»' });
    expect(within(group).getByRole('radio', { name: 'Prugna' })).toBeChecked();
    await userEvent.click(within(group).getByRole('radio', { name: 'Salvia' }));
    await waitFor(() => expect(patches(platform)).toHaveLength(1));
    expect(patches(platform)[0]).toMatchObject({ path: '/api/v1/tags/t1', body: { color: 'sage' } });
  });

  it('asks before deleting and says how many books lose the tag', async () => {
    const { dialog, platform } = await open({ tags: [...TAGS] });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Elimina «Fantasy»' }));
    const confirm = await screen.findByRole('dialog', { name: 'Eliminare il tag «Fantasy»?' });
    expect(within(confirm).getByText(/tolto da 3 libri/)).toBeInTheDocument();
    expect(platform.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Elimina' }));
    await waitFor(() => expect(platform.calls.filter((c) => c.method === 'DELETE')).toHaveLength(1));
    expect(platform.calls.find((c) => c.method === 'DELETE')!.path).toBe('/api/v1/tags/t1');
    await waitFor(() => expect(within(dialog).queryByRole('textbox', { name: 'Nome di «Fantasy»' })).toBeNull());
  });

  it('has no entry point without write permission', async () => {
    renderBooks({ books: makeDb(1), role: 'guest', extra: tagHandler({ tags: [...TAGS] }) });
    await screen.findByRole('link', { name: 'Libro 1, Autore 1' });
    expect(screen.queryByRole('button', { name: 'Altro' })).toBeNull();
  });
});

describe('assign to many', () => {
  const select = async (n: number) => {
    await userEvent.click(await screen.findByRole('button', { name: 'Seleziona' }));
    for (let i = 1; i <= n; i++) await userEvent.click(await screen.findByRole('checkbox', { name: `Seleziona «Libro ${i}»` }));
    await userEvent.click(screen.getByRole('button', { name: 'Tag…' }));
    return screen.findByRole('dialog', { name: 'Tag per 3 libri' });
  };

  it('sends one request per book and sums up', async () => {
    const state = { tags: [...TAGS] };
    const { platform } = renderBooks({ books: makeDb(3), extra: tagHandler(state) });
    const dialog = await select(3);
    expect(within(dialog).getByRole('button', { name: 'Aggiungi a 3 libri' })).toBeDisabled();
    await userEvent.click(await within(dialog).findByRole('radio', { name: 'Fantasy' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aggiungi a 3 libri' }));
    expect(await within(dialog).findByText('Aggiornati: 3. Già a posto: 0. Non riusciti: 0.')).toBeInTheDocument();
    expect(puts(platform).map((c) => c.path)).toEqual(['/api/v1/books/b1/tags', '/api/v1/books/b2/tags', '/api/v1/books/b3/tags']);
    expect(puts(platform).every((c) => JSON.stringify(c.body) === '{"tag_ids":["t1"]}')).toBe(true);
  });

  it('lists the books that failed and keeps going', async () => {
    const state = { tags: [...TAGS] };
    const handler = tagHandler(state);
    const { platform } = renderBooks({
      books: makeDb(3),
      extra: (r) => (r.method === 'PUT' && r.path === '/api/v1/books/b2/tags' ? { status: 500, body: { error_code: 'internal', message: 'x' } } : handler(r)),
    });
    const dialog = await select(3);
    await userEvent.click(await within(dialog).findByRole('radio', { name: 'Fantasy' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aggiungi a 3 libri' }));
    expect(await within(dialog).findByText('Aggiornati: 2. Già a posto: 0. Non riusciti: 1.')).toBeInTheDocument();
    expect(within(dialog).getByText(/Libro 2: /)).toBeInTheDocument();
    expect(puts(platform)).toHaveLength(3);
  });

  it('removes a tag only from the books that have it', async () => {
    const state = { tags: [...TAGS] };
    const books = [book(1, { tags: [fantasy] }), book(2), book(3, { tags: [fantasy, { id: 't2', name: 'Classici', color: 'amber' }] })];
    const { platform } = renderBooks({ books, extra: tagHandler(state) });
    const dialog = await select(3);
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Togli il tag' }));
    await userEvent.click(await within(dialog).findByRole('radio', { name: 'Fantasy' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Togli da 3 libri' }));
    expect(await within(dialog).findByText('Aggiornati: 2. Già a posto: 1. Non riusciti: 0.')).toBeInTheDocument();
    expect(puts(platform).map((c) => c.body)).toEqual([{ tag_ids: [] }, { tag_ids: ['t2'] }]);
  });
});

describe('book form', () => {
  const tagRoutes = (state: { tags: typeof TAGS }) => {
    const handler = tagHandler(state);
    const answer = (r: { method: string; path: string; body?: unknown }) => handler(r)!;
    return { 'GET /api/v1/tags': answer, 'PUT /api/v1/books/new/tags': answer, 'PUT /api/v1/books/b1/tags': answer };
  };

  it('creates the book, then sets its tags', async () => {
    const { platform } = renderWithWrites({ books: [] }, tagRoutes({ tags: [...TAGS] }));
    await openNewBook();
    await lookUp();
    await screen.findByText(/Dati trovati da/);
    await userEvent.type(screen.getByRole('combobox', { name: 'Tag' }), 'fan');
    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(puts(platform)).toHaveLength(1));
    expect(sent(platform, 'POST', '/api/v1/books')).toHaveLength(1);
    expect(puts(platform)[0]).toMatchObject({ path: '/api/v1/books/new/tags', body: { tag_ids: ['t1'] } });
  });

  it('edits only the tags with a single PUT and no PATCH', async () => {
    const { platform } = renderWithWrites({ books: [tagged()] }, tagRoutes({ tags: [...TAGS] }), '/books/b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica' }));
    const drawer = await screen.findByRole('dialog', { name: 'Modifica libro' });
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Rimuovi «Fantasy»' }));
    await userEvent.click(within(drawer).getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(puts(platform)).toHaveLength(1));
    expect(puts(platform)[0]).toMatchObject({ body: { tag_ids: [] } });
    expect(platform.calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
  });
});
