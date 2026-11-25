import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FACET_SHELVES, installIntersectionObserver, listCalls, makeDb, renderBooks } from './testkit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const lib = () => ({ books: makeDb(5), shelves: FACET_SHELVES });

async function openPanel(route = '/books') {
  const view = renderBooks(lib(), route);
  await userEvent.click(await screen.findByRole('button', { name: /^Filtri/ }));
  const panel = await screen.findByRole('dialog', { name: 'Filtri' });
  await within(panel).findByRole('checkbox', { name: 'Preferiti (3)' });
  return { ...view, panel };
}

const lastList = (platform: Parameters<typeof listCalls>[0]) => listCalls(platform).filter((p) => p.get('limit') === '60').at(-1)!;

describe('filters panel', () => {
  it('sends the right parameter for each filter, with two tags as two tag_id', async () => {
    const { panel, platform, router } = await openPanel();
    await userEvent.click(within(panel).getByRole('button', { name: 'Letto (3)' }));
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Preferiti (3)' }));
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Regalo (1)' }));
    await userEvent.selectOptions(within(panel).getByLabelText('Genere'), 'Giallo');
    await userEvent.selectOptions(within(panel).getByLabelText('Lingua'), 'it');
    await userEvent.selectOptions(within(panel).getByLabelText('Formato'), 'paperback');
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Solo i libri in prestito' }));
    await userEvent.type(within(panel).getByLabelText('Anno da'), '1990');
    await userEvent.type(within(panel).getByLabelText('Anno a'), '2000');
    fireEvent.change(within(panel).getByLabelText('Acquistato dal'), { target: { value: '2024-01-05' } });
    fireEvent.change(within(panel).getByLabelText('Acquistato al'), { target: { value: '2024-02-10' } });
    await userEvent.click(within(panel).getByRole('button', { name: /^Mostra/ }));
    await waitFor(() => expect(lastList(platform).get('reading')).toBe('read'));
    const p = lastList(platform);
    expect(p.getAll('tag_id')).toEqual(['t1', 't2']);
    expect(p.get('genre')).toBe('Giallo');
    expect(p.get('language')).toBe('it');
    expect(p.get('format')).toBe('paperback');
    expect(p.get('on_loan')).toBe('true');
    expect(p.get('year_from')).toBe('1990');
    expect(p.get('year_to')).toBe('2000');
    expect(p.get('acquired_from')).toBe(String(Math.floor(new Date(2024, 0, 5).getTime() / 1000)));
    expect(p.get('acquired_to')).toBe(String(Math.floor(new Date(2024, 1, 11).getTime() / 1000) - 1));
    const url = new URLSearchParams(router.state.location.search);
    expect(url.getAll('tag')).toEqual(['t1', 't2']);
    expect(url.get('reading')).toBe('read');
    expect(url.get('on_loan')).toBe('true');
    expect(url.get('year_from')).toBe('1990');
    expect(screen.queryByRole('dialog', { name: 'Filtri' })).toBeNull();
  });

  it('limits the shelves to the chosen room and shows the counts', async () => {
    const { panel, platform } = await openPanel();
    const shelf = within(panel).getByLabelText('Scaffale');
    expect(within(shelf).getAllByRole('option').map((o) => o.textContent)).toEqual(['Tutti gli scaffali', 'Salotto (2)', 'Libreria (3)']);
    expect(within(panel).getByRole('option', { name: 'Studio (3)' })).toBeInTheDocument();
    await userEvent.selectOptions(within(panel).getByLabelText('Stanza'), 'r1');
    expect(within(shelf).getAllByRole('option').map((o) => o.textContent)).toEqual(['Tutti gli scaffali', 'Libreria (3)']);
    await userEvent.selectOptions(shelf, 's2');
    // Another room drops a shelf that is not in it.
    await userEvent.selectOptions(within(panel).getByLabelText('Stanza'), 'r2');
    expect(shelf).toHaveValue('');
    await userEvent.selectOptions(shelf, 's1');
    await userEvent.click(within(panel).getByRole('button', { name: /^Mostra/ }));
    await waitFor(() => expect(lastList(platform).get('shelf_id')).toBe('s1'));
    expect(lastList(platform).get('room_id')).toBe('r2');
  });

  it('keeps "Show N books" up to date, 300 ms after each edit, with limit=1', async () => {
    const { panel, platform } = await openPanel();
    expect(await within(panel).findByRole('button', { name: 'Mostra 5 libri' })).toBeInTheDocument();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const before = listCalls(platform).filter((p) => p.get('limit') === '1').length;
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Preferiti (3)' }));
    await act(() => vi.advanceTimersByTimeAsync(299));
    expect(listCalls(platform).filter((p) => p.get('limit') === '1')).toHaveLength(before);
    expect(within(panel).queryByRole('button', { name: /^Mostra \d/ })).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(10));
    await act(() => vi.advanceTimersByTimeAsync(50));
    const sent = listCalls(platform).filter((p) => p.get('limit') === '1').slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.getAll('tag_id')).toEqual(['t1']);
    expect(within(panel).getByRole('button', { name: /^Mostra \d+ libr/ })).toBeInTheDocument();
  });

  it('resets the draft, and closing without "Show" changes nothing', async () => {
    const { panel, router } = await openPanel();
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Regalo (1)' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Azzera' }));
    expect(within(panel).getByRole('checkbox', { name: 'Regalo (1)' })).not.toBeChecked();
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Regalo (1)' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Chiudi' }));
    expect(router.state.location.search).toBe('');
  });

  it('starts from the filters of the address', async () => {
    const { panel } = await openPanel('/books?tag=t2&room=r1&genre=Fantasy');
    expect(within(panel).getByRole('checkbox', { name: 'Regalo (1)' })).toBeChecked();
    expect(within(panel).getByLabelText('Stanza')).toHaveValue('r1');
    expect(within(panel).getByLabelText('Genere')).toHaveValue('Fantasy');
  });
});
