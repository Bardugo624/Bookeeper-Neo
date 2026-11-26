import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { book, renderShelves, room, shelf, type World } from './testkit';

function world(over: Partial<World> = {}): World {
  return {
    shelves: [shelf(1), shelf(2)],
    books: ['b1', 'b2', 'c1', 'u1'].map((id) => book(id)),
    spots: { b1: { shelf: 's1', row: 0, slot: 0 }, b2: { shelf: 's1', row: 2 - 1, slot: 11 }, c1: { shelf: 's2', row: 0, slot: 3 } },
    ...over,
  };
}

describe('where is it', () => {
  it('pulls the spine out and says where it stands, counted from 1', async () => {
    renderShelves(world(), '/shelves?unit=s1&book=b2');
    expect(await screen.findByText('«Libro b2» · Mobile 1 · ripiano 2 · posto 12')).toBeInTheDocument();
    expect(screen.getByText('«Libro b2» · Mobile 1 · ripiano 2 · posto 12').closest('[role="status"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Libro b2, Autore b2' })).toHaveAttribute('data-pulled', 'true');
    expect(screen.getByRole('button', { name: 'Libro b1, Autore b1' })).not.toHaveAttribute('data-pulled');
  });

  it('"Fatto" drops the book from the address and puts the spine back', async () => {
    const { router } = renderShelves(world(), '/shelves?unit=s1&book=b1');
    await userEvent.click(await screen.findByRole('button', { name: 'Fatto' }));
    expect(router.state.location.search).toBe('?unit=s1');
    expect(screen.getByRole('button', { name: 'Libro b1, Autore b1' })).not.toHaveAttribute('data-pulled');
    expect(screen.queryByRole('button', { name: 'Fatto' })).toBeNull();
  });

  it('Esc does the same', async () => {
    const { router } = renderShelves(world(), '/shelves?unit=s1&book=b1');
    await screen.findByRole('button', { name: 'Fatto' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(router.state.location.search).toBe('?unit=s1'));
  });

  it('follows a book that moved to another unit', async () => {
    const { router } = renderShelves(world(), '/shelves?unit=s1&book=c1');
    expect(await screen.findByText('«Libro c1» · Mobile 2 · ripiano 1 · posto 4')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?unit=s2&book=c1');
  });

  it('says so when the book is not on any shelf, and offers "Colloca in…"', async () => {
    renderShelves(world(), '/shelves?unit=s1&book=u1');
    expect(await screen.findByText('«Libro u1» · Non è su nessuno scaffale')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Colloca in…' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('offers no placing to a guest', async () => {
    renderShelves(world({ role: 'guest' }), '/shelves?unit=s1&book=u1');
    expect(await screen.findByText('«Libro u1» · Non è su nessuno scaffale')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Colloca in…' })).toBeNull();
  });

  it('says so when the book no longer exists, and "Fatto" closes the line', async () => {
    const { router } = renderShelves(world(), '/shelves?unit=s1&book=zz');
    expect(await screen.findByText("Questo libro non c'è più")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fatto' }));
    expect(router.state.location.search).toBe('?unit=s1');
    expect(screen.queryByText("Questo libro non c'è più")).toBeNull();
  });

  it('wins over a room filter: the filter is lifted and the right unit opens', async () => {
    const w = world({
      rooms: [room('r1', 'Salotto'), room('r2', 'Studio')],
      shelves: [shelf(1, { room_id: 'r1' }), shelf(2, { room_id: 'r2' })],
    });
    const { router } = renderShelves(w, '/shelves?room=r1&unit=s2&book=c1');
    expect(await screen.findByText('«Libro c1» · Mobile 2 · ripiano 1 · posto 4')).toBeInTheDocument();
    expect(router.state.location.search).not.toContain('room=');
    expect(router.state.location.search).toContain('unit=s2');
  });

  it('wins over a room filter that shows no cabinet at all', async () => {
    const w = world({
      rooms: [room('r1', 'Salotto'), room('r3', 'Cantina')],
      shelves: [shelf(1, { room_id: 'r1' }), shelf(2, { room_id: 'r1' })],
    });
    const { router } = renderShelves(w, '/shelves?room=r3&unit=s2&book=c1');
    expect(await screen.findByText('«Libro c1» · Mobile 2 · ripiano 1 · posto 4')).toBeInTheDocument();
    expect(router.state.location.search).not.toContain('room=');
    expect(router.state.location.search).toContain('unit=s2');
    expect(screen.queryByText(/Nessun mobile in questa stanza/)).toBeNull();
  });
});
