import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { BookOut } from '@bookeeper/api';
import { renderMobile } from '../../app/testing';
import { fakePlatform, type Handler } from '../../platform/testing';
import { ME, ok, pair } from '../../session/fixtures';
import { module as search } from '../search/routes';
import { module } from './routes';

const shelf = (id: string, name: string, room: { id: string; name: string } | null, count: number) => ({
  id, name, room, room_id: room?.id ?? null, color: 'sage', rows: 3, slots_per_row: 16, capacity: 48,
  book_count: count, label_code: 1, created_at: 1, updated_at: 1,
});
const salotto = { id: 'r1', name: 'Salotto' };
const studio = { id: 'r2', name: 'Studio' };
const SHELVES = [
  shelf('s3', 'Senza posto', null, 0),
  shelf('s2', 'Scrivania', studio, 1),
  shelf('s1', 'Libreria', salotto, 2),
];
const ON = [
  { book_id: 'b1', title: 'Il nome della rosa', authors: ['Eco'], row_index: 0, slot_index: 0 },
  { book_id: 'b2', title: 'Dune', authors: [], row_index: 1, slot_index: 3 },
];
const BOOK = { id: 'b1', title: 'Il nome della rosa', authors: ['Eco'], on_loan: false, file_formats: [], created_at: 1, updated_at: 1 } as BookOut;

const handler: Handler = async (call) => {
  const path = new URL(call.path, 'http://x').pathname;
  if (path === '/api/v1/me') return ok(ME);
  if (path === '/api/v1/shelves') return ok({ items: SHELVES, total: 3 });
  if (path === '/api/v1/shelves/s1/books') return ok({ items: ON });
  const one = /^\/api\/v1\/shelves\/([^/]+)$/.exec(path);
  if (one) {
    const found = SHELVES.find((s) => s.id === one[1]);
    return found ? ok(found) : { status: 404, body: { error_code: 'not_found', message: 'x' } };
  }
  if (path === '/api/v1/books/b1') return ok({ ...BOOK, placement: { shelf_id: 's1', row_index: 0, slot_index: 0 } });
  return { status: 404, body: { error_code: 'not_found', message: 'x' } };
};

function render(route: string, methods: string[] = []) {
  const platform = fakePlatform({ handler: async (c) => { methods.push(c.method); return handler(c); } });
  pair(platform.storage);
  return renderMobile({ platform, modules: [module, search], route });
}

describe('shelves list', () => {
  it('groups furniture by room with the number of books', async () => {
    render('/shelves');
    const salotto = await screen.findByRole('region', { name: 'Salotto' });
    expect(within(salotto).getByText('Libreria')).toBeInTheDocument();
    expect(within(salotto).getByText('2 libri')).toBeInTheDocument();
    const studio = screen.getByRole('region', { name: 'Studio' });
    expect(within(studio).getByText('1 libro')).toBeInTheDocument();
    const none = screen.getByRole('region', { name: 'Senza stanza' });
    expect(within(none).getByText('Senza posto')).toBeInTheDocument();
    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual(['Salotto', 'Studio', 'Senza stanza']);
  });

  it('opens a piece of furniture', async () => {
    const user = userEvent.setup();
    const { router } = render('/shelves');
    await user.click(await screen.findByRole('link', { name: /Libreria/ }));
    expect(router.state.location.pathname).toBe('/shelves/s1');
  });
});

describe('shelf page', () => {
  it('draws the cabinet with the spines and offers no write gesture', async () => {
    const methods: string[] = [];
    render('/shelves/s1', methods);
    expect(await screen.findByRole('heading', { level: 2, name: 'Libreria' })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Mobile Libreria' })).toBeInTheDocument();
    await spines(2);
    expect(document.querySelectorAll('[draggable="true"]')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /sposta|colloca|rimuovi|aggiungi/i })).toBeNull();
    expect(methods.every((m) => m === 'GET')).toBe(true);
  });

  it('lists the books shelf by shelf as 44px-high links, the control the narrow spines are not', async () => {
    const user = userEvent.setup();
    const { router } = render('/shelves/s1');
    const list = await screen.findByRole('region', { name: 'Libri per ripiano' });
    expect(within(list).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Ripiano 1', 'Ripiano 2']);
    expect(within(list).getAllByRole('link').map((a) => a.textContent)).toEqual(['Il nome della rosaEco', 'Dune']);
    await user.click(within(list).getByRole('link', { name: /Dune/ }));
    expect(router.state.location.pathname).toBe('/books/b2');
  });

  it('opens the book card from a spine', async () => {
    const user = userEvent.setup();
    const { router } = render('/shelves/s1');
    await spines(2);
    await user.click(screen.getAllByRole('button', { name: /Il nome della rosa/ })[0]!);
    expect(router.state.location.pathname).toBe('/books/b1');
  });

  it('says so when the furniture does not exist', async () => {
    render('/shelves/zzz');
    expect(await screen.findByText('Mobile non trovato')).toBeInTheDocument();
  });
});

describe('entries', () => {
  it('has a Scaffali button in the search header', async () => {
    const user = userEvent.setup();
    const { router } = render('/search');
    await user.click(await screen.findByRole('link', { name: 'Scaffali' }));
    expect(router.state.location.pathname).toBe('/shelves');
  });

  it('has "Apri il mobile" in the where block of a shelved book', async () => {
    const user = userEvent.setup();
    const { router } = render('/books/b1');
    const where = await screen.findByRole('region', { name: 'Dove si trova' });
    await user.click(await within(where).findByRole('link', { name: 'Apri il mobile' }));
    expect(router.state.location.pathname).toBe('/shelves/s1');
  });
});

async function spines(n: number) {
  await waitFor(() => expect(screen.getAllByRole('button', { name: /Il nome della rosa|Dune/ })).toHaveLength(n));
}
