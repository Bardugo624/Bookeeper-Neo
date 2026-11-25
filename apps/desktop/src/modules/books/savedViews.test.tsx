import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeConnection } from '../../platform/testing';
import { installIntersectionObserver, makeDb, renderBooks } from './testkit';

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  installIntersectionObserver();
});

const lib = () => ({ books: makeDb(3) });
const stored = (id = 'c1') => JSON.parse(localStorage.getItem(`bookeeper.books.views.${id}`) ?? '[]') as Array<{ id: string; name: string; search: string }>;

async function saveView(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Viste' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Salva questa vista' }));
  const dialog = await screen.findByRole('dialog', { name: 'Salva questa vista' });
  await userEvent.type(within(dialog).getByLabelText('Nome della vista'), name);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Salva' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Salva questa vista' })).toBeNull());
}

describe('saved views', () => {
  it('saves the current combination under the connection and applies it later', async () => {
    const { router } = renderBooks(lib(), '/books?q=libro&genre=Giallo&tag=t1&sort=title&order=desc&view=list');
    await saveView('Gialli  ');
    expect(stored()).toEqual([expect.objectContaining({ name: 'Gialli', search: 'q=libro&tag=t1&genre=Giallo&sort=title&order=desc' })]);
    await act(() => router.navigate('/books?view=list'));
    await waitFor(() => expect(router.state.location.search).not.toContain('genre'));
    await userEvent.click(screen.getByRole('button', { name: 'Viste' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Gialli' }));
    await waitFor(() => expect(router.state.location.search).toContain('genre=Giallo'));
    const url = new URLSearchParams(router.state.location.search);
    expect(url.get('q')).toBe('libro');
    expect(url.getAll('tag')).toEqual(['t1']);
    expect(url.get('sort')).toBe('title');
    expect(url.get('order')).toBe('desc');
    // The way of looking at the list is not part of a view.
    expect(url.get('view')).toBe('list');
  });

  it('does not offer to save an empty view', async () => {
    renderBooks(lib(), '/books');
    await userEvent.click(await screen.findByRole('button', { name: 'Viste' }));
    expect(await screen.findByRole('menuitem', { name: 'Salva questa vista' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('renames and deletes', async () => {
    localStorage.setItem('bookeeper.books.views.c1', JSON.stringify([{ id: 'v1', name: 'Uno', search: 'genre=Giallo' }, { id: 'v2', name: 'Due', search: 'language=it' }]));
    renderBooks(lib());
    await userEvent.click(await screen.findByRole('button', { name: 'Viste' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Gestisci le viste' }));
    const dialog = await screen.findByRole('dialog', { name: 'Viste salvate' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rinomina Uno' }));
    const field = within(dialog).getByLabelText('Nome della vista');
    await userEvent.clear(field);
    await userEvent.type(field, 'Primo{Enter}');
    expect(within(dialog).getByText('Primo')).toBeInTheDocument();
    expect(stored().map((v) => v.name)).toEqual(['Primo', 'Due']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Elimina Due' }));
    expect(stored().map((v) => v.name)).toEqual(['Primo']);
    expect(within(dialog).queryByText('Due')).toBeNull();
  });

  it('holds at most 10', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ id: `v${i}`, name: `Vista ${i}`, search: 'genre=Giallo' }));
    localStorage.setItem('bookeeper.books.views.c1', JSON.stringify([...ten, { id: 'v10', name: 'Undici', search: 'genre=Giallo' }]));
    renderBooks(lib(), '/books?genre=Fantasy');
    await userEvent.click(await screen.findByRole('button', { name: 'Viste' }));
    expect(await screen.findAllByRole('menuitem', { name: /^Vista \d$/ })).toHaveLength(10);
    expect(screen.queryByRole('menuitem', { name: 'Undici' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Limite di 10 viste raggiunto' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps the views apart per connection', async () => {
    localStorage.setItem('bookeeper.books.views.c1', JSON.stringify([{ id: 'v1', name: 'Di casa', search: 'genre=Giallo' }]));
    const connections = { active: 'c2', items: [fakeConnection(), fakeConnection({ id: 'c2', library_name: 'Altra' })] };
    renderBooks(lib(), '/books?genre=Fantasy', connections);
    await userEvent.click(await screen.findByRole('button', { name: 'Viste' }));
    await screen.findByRole('menuitem', { name: 'Salva questa vista' });
    expect(screen.queryByRole('menuitem', { name: 'Di casa' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await saveView('Fantasy');
    expect(stored('c2').map((v) => v.name)).toEqual(['Fantasy']);
    expect(stored('c1').map((v) => v.name)).toEqual(['Di casa']);
  });

  it('survives corrupt storage', async () => {
    localStorage.setItem('bookeeper.books.views.c1', '{oops');
    renderBooks(lib());
    await userEvent.click(await screen.findByRole('button', { name: 'Viste' }));
    expect(await screen.findByRole('menuitem', { name: 'Gestisci le viste' })).toHaveAttribute('aria-disabled', 'true');
  });
});
