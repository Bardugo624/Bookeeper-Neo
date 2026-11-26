import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BookOut } from '@bookeeper/api';
import { ME, ok } from '../../session/fixtures';
import type { RecordedCall } from '../../platform/testing';
import { book, renderSearch } from './testkit';

beforeEach(() => localStorage.clear());

const people = [
  { id: 'u1', display_name: 'Anna', role: 'owner', is_me: true },
  { id: 'u2', display_name: 'Marco', role: 'member', is_me: false },
];

interface Server {
  role?: string;
  readers?: unknown[];
  patch?: (call: RecordedCall) => { status: number; body: unknown } | undefined;
}

function open(b: BookOut, server: Server = {}, route = `/books/${b.id}`) {
  let current = b;
  const view = renderSearch({
    api: {
      books: [b],
      override: async (call) => {
        const path = call.path.replace('/api/v1', '');
        if (path === '/me') return ok({ ...ME, user: { ...ME.user, role: server.role ?? 'owner' } });
        if (path === '/users') return ok({ items: people, total: 2 });
        if (/\/readers$/.test(path)) return ok({ items: server.readers ?? [] });
        if (call.method === 'PATCH') {
          const own = server.patch?.(call);
          if (own) return own;
          current = { ...current, ...(call.body as object) } as BookOut;
          return ok(current);
        }
        if (call.method === 'GET' && path === `/books/${b.id}`) return ok(current);
        return undefined;
      },
    },
    route,
  });
  const patches = () => view.platform.fake.calls.filter((c) => c.method === 'PATCH');
  return { ...view, patches };
}

const full = book(1, { id: 'b1', title: 'Dune', subtitle: 'Il ciclo', authors: ['Frank Herbert'], publisher: 'Adelphi', published_year: 1965, page_count: 600 });

describe('detail: owner and readers', () => {
  it('says whose the book is, "Tu" for the caller, and nothing when it is everyone\'s', async () => {
    const mine = open(book(1, { owner: { id: 'u2', display_name: 'Marco' } }));
    expect(await screen.findByText('Di chi è: Marco')).toBeInTheDocument();
    mine.unmount();
    const own = open(book(1, { owner: { id: 'u1', display_name: 'Anna' } }));
    expect(await screen.findByText('Di chi è: Tu')).toBeInTheDocument();
    own.unmount();
    open(book(1));
    await screen.findByRole('region', { name: 'Prestito' });
    expect(screen.queryByText(/Di chi è/)).toBeNull();
  });

  it('lists who reads it, with the month of a finished book', async () => {
    open(book(1), {
      readers: [
        { user: { id: 'u2', display_name: 'Marco' }, is_me: false, status: 'reading' },
        { user: { id: 'u1', display_name: 'Anna' }, is_me: true, status: 'read', finished_at: Date.UTC(2025, 2, 10) / 1000 },
        { user: { id: 'u3', display_name: 'Zoe' }, is_me: false, status: 'none' },
      ],
    });
    const block = await screen.findByRole('region', { name: 'Chi lo legge' });
    expect(within(block).getByText('Marco · sta leggendo')).toBeInTheDocument();
    expect(within(block).getByText('Tu · l’ha letto a marzo 2025')).toBeInTheDocument();
    expect(within(block).queryByText(/Zoe/)).toBeNull();
  });

  it('leaves the block out when nobody has a state', async () => {
    open(book(1));
    await screen.findByRole('region', { name: 'Prestito' });
    expect(screen.queryByRole('region', { name: 'Chi lo legge' })).toBeNull();
  });
});

describe('detail: the edit command', () => {
  it('is a link to the form for who may write books', async () => {
    open(full);
    expect(await screen.findByRole('link', { name: 'Modifica' })).toHaveAttribute('href', '/books/b1/edit');
  });

  it('is absent for a guest', async () => {
    open(full, { role: 'guest' });
    await screen.findByRole('region', { name: 'Prestito' });
    expect(screen.queryByRole('link', { name: 'Modifica' })).toBeNull();
  });
});

describe('edit page', () => {
  const field = async (name: string) => (await screen.findByLabelText(name)) as HTMLInputElement;

  it('starts with the stored values', async () => {
    open(full, {}, '/books/b1/edit');
    expect((await field('Titolo')).value).toBe('Dune');
    expect((await field('Sottotitolo')).value).toBe('Il ciclo');
    expect((await field('Autore 1')).value).toBe('Frank Herbert');
    expect((await field('Editore')).value).toBe('Adelphi');
    expect((await field('Anno')).value).toBe('1965');
    expect((await field('Pagine')).value).toBe('600');
    expect(await field('Anno')).toHaveAttribute('inputmode', 'numeric');
    expect(await field('Pagine')).toHaveAttribute('inputmode', 'numeric');
  });

  it('sends only the changed fields, then returns to the updated page', async () => {
    const user = userEvent.setup();
    const view = open(full, {}, '/books/b1/edit');
    const title = await field('Titolo');
    await user.clear(title);
    await user.type(title, 'Dune Messiah');
    await user.click(screen.getByRole('button', { name: 'Aggiungi autore' }));
    await user.type(await field('Autore 2'), 'Brian Herbert');
    await user.selectOptions(screen.getByLabelText('Di chi è'), 'u2');
    await user.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(view.router.state.location.pathname).toBe('/books/b1'));
    expect(view.patches()).toHaveLength(1);
    expect(view.patches()[0]!.path).toBe('/api/v1/books/b1');
    expect(view.patches()[0]!.body).toEqual({ title: 'Dune Messiah', authors: ['Frank Herbert', 'Brian Herbert'], owner_user_id: 'u2' });
    expect(await screen.findByRole('heading', { level: 2, name: 'Dune Messiah' })).toBeInTheDocument();
  });

  it('clears a field with null and sends nothing when nothing changed', async () => {
    const user = userEvent.setup();
    const view = open(full, {}, '/books/b1/edit');
    await user.clear(await field('Sottotitolo'));
    await user.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(view.router.state.location.pathname).toBe('/books/b1'));
    expect(view.patches()[0]!.body).toEqual({ subtitle: null });
    view.unmount();
    const same = open(full, {}, '/books/b1/edit');
    await field('Titolo');
    await user.click(screen.getByRole('button', { name: 'Salva' }));
    await waitFor(() => expect(same.router.state.location.pathname).toBe('/books/b1'));
    expect(same.patches()).toHaveLength(0);
  });

  it('wants a title before sending anything', async () => {
    const user = userEvent.setup();
    const view = open(full, {}, '/books/b1/edit');
    await user.clear(await field('Titolo'));
    await user.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByText('Campo obbligatorio')).toBeInTheDocument();
    expect(view.patches()).toHaveLength(0);
  });

  it('puts a 422 of the server on its field', async () => {
    const user = userEvent.setup();
    const view = open(full, {
      patch: () => ({ status: 422, body: { error_code: 'validation', message: 'published_year must be between 1 and 2100' } }),
    }, '/books/b1/edit');
    const year = await field('Anno');
    await user.clear(year);
    await user.type(year, '2000');
    await user.click(screen.getByRole('button', { name: 'Salva' }));
    expect(await screen.findByText('Il valore non è valido.')).toBeInTheDocument();
    expect(year).toHaveAccessibleDescription('Il valore non è valido.');
    expect(view.router.state.location.pathname).toBe('/books/b1/edit');
  });

  it('asks before leaving with unsaved changes', async () => {
    const user = userEvent.setup();
    const view = open(full, {}, '/books/b1/edit');
    await user.type(await field('Editore'), ' Milano');
    await user.click(screen.getByRole('button', { name: 'Torna alla scheda' }));
    const sheet = await screen.findByRole('dialog', { name: 'Uscire senza salvare?' });
    expect(view.router.state.location.pathname).toBe('/books/b1/edit');
    await user.click(within(sheet).getByRole('button', { name: 'Continua a modificare' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await field('Editore')).value).toBe('Adelphi Milano');
    await user.click(screen.getByRole('button', { name: 'Torna alla scheda' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Esci senza salvare' }));
    await waitFor(() => expect(view.router.state.location.pathname).toBe('/books/b1'));
    expect(view.patches()).toHaveLength(0);
  });

  it('leaves at once when nothing changed', async () => {
    const user = userEvent.setup();
    const view = open(full, {}, '/books/b1/edit');
    await field('Titolo');
    await user.click(screen.getByRole('button', { name: 'Torna alla scheda' }));
    await waitFor(() => expect(view.router.state.location.pathname).toBe('/books/b1'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sends a guest back to the page', async () => {
    const view = open(full, { role: 'guest' }, '/books/b1/edit');
    await waitFor(() => expect(view.router.state.location.pathname).toBe('/books/b1'));
  });
});
