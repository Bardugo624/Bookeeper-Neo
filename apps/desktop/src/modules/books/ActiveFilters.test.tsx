import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FACET_SHELVES, installIntersectionObserver, listCalls, makeDb, renderBooks } from './testkit';

beforeEach(() => {
  localStorage.clear();
  installIntersectionObserver();
  vi.unstubAllGlobals();
  installIntersectionObserver();
});

const lib = () => ({ books: makeDb(4), shelves: FACET_SHELVES });
const chips = () => within(screen.getByRole('list', { name: 'Filtri attivi' })).getAllByRole('button');
const last = (platform: Parameters<typeof listCalls>[0]) => listCalls(platform).filter((p) => p.get('limit') === '60').at(-1)!;

describe('active filters', () => {
  it('shows removable labels named from the facets and counts them on the button', async () => {
    renderBooks(lib(), '/books?reading=abandoned&tag=t1&room=r1&shelf=s2&genre=Giallo&year_from=1990&year_to=2000');
    await screen.findByRole('button', { name: 'Filtri (6)' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Togli il filtro: Tag: Preferiti' })).toBeInTheDocument());
    expect(chips().map((c) => c.textContent)).toEqual([
      'Lettura: Abbandonato',
      'Tag: Preferiti',
      'Stanza: Studio',
      'Scaffale: Libreria',
      'Genere: Giallo',
      'Anno 1990–2000',
    ]);
  });

  it('removes one filter at a time, then everything', async () => {
    const { platform, router } = renderBooks(lib(), '/books?genre=Giallo&language=it&format=paperback');
    await screen.findByRole('link', { name: 'Libro 1 Autore 1' });
    await userEvent.click(screen.getByRole('button', { name: 'Togli il filtro: Genere: Giallo' }));
    await waitFor(() => expect(last(platform).get('genre')).toBeNull());
    expect(last(platform).get('language')).toBe('it');
    expect(router.state.location.search).toBe('?language=it&format=paperback');
    expect(chips().map((c) => c.textContent)).toEqual(['Lingua: it', 'Formato: Brossura']);
    await userEvent.click(screen.getByRole('button', { name: 'Azzera tutto' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.queryByRole('list', { name: 'Filtri attivi' })).toBeNull();
  });

  it('keeps the quick pills and the panel in step', async () => {
    const { router } = renderBooks(lib(), '/books');
    await userEvent.click(await screen.findByRole('tab', { name: 'In prestito' }));
    expect(await screen.findByRole('button', { name: 'Filtri (1)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Filtri/ }));
    const panel = await screen.findByRole('dialog', { name: 'Filtri' });
    await within(panel).findByRole('checkbox', { name: 'Preferiti (3)' });
    expect(within(panel).getByRole('checkbox', { name: 'Solo i libri in prestito' })).toBeChecked();
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Preferiti (3)' }));
    await userEvent.click(within(panel).getByRole('button', { name: /^Mostra/ }));
    // More than a pill can say: no pill is lit, the other filters stay when a pill is chosen.
    await waitFor(() => expect(within(screen.getByRole('tablist', { name: 'Filtri' })).queryAllByRole('tab', { selected: true })).toHaveLength(0));
    await userEvent.click(screen.getByRole('tab', { name: 'Letti' }));
    const url = new URLSearchParams(router.state.location.search);
    expect(url.get('reading')).toBe('read');
    expect(url.get('on_loan')).toBeNull();
    expect(url.getAll('tag')).toEqual(['t1']);
    await userEvent.click(screen.getByRole('tab', { name: 'Tutti' }));
    expect(new URLSearchParams(router.state.location.search).getAll('tag')).toEqual(['t1']);
  });

  it('combines the text search with the filters and lists them when nothing matches', async () => {
    const { router } = renderBooks(lib(), '/books?q=zzz&tag=t1&genre=Giallo');
    await screen.findByText('Nessun risultato');
    const list = screen.getByRole('list', { name: 'Filtri attivi' });
    await within(list).findByRole('button', { name: 'Togli il filtro: Tag: Preferiti' });
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual(['Ricerca: zzz', 'Tag: Preferiti', 'Genere: Giallo']);
    await userEvent.click(within(list).getByRole('button', { name: 'Togli il filtro: Ricerca: zzz' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Togli il filtro: Tag: Preferiti' }));
    expect(new URLSearchParams(router.state.location.search).get('q')).toBeNull();
    expect(new URLSearchParams(router.state.location.search).get('genre')).toBe('Giallo');
    await screen.findByRole('link', { name: 'Libro 1 Autore 1' });
  });

  it('"Clear search and filters" empties the address', async () => {
    const { router } = renderBooks(lib(), '/books?q=zzz&genre=Giallo&sort=title');
    await userEvent.click(await screen.findByRole('button', { name: 'Azzera ricerca e filtri' }));
    await screen.findByRole('link', { name: 'Libro 1 Autore 1' });
    expect(router.state.location.search).toBe('?sort=title');
  });
});

describe('address', () => {
  it('reopens the same view from a copied address', async () => {
    const search =
      '?reading=read&tag=t1&tag=t2&room=r1&shelf=s2&genre=Giallo&language=it&format=paperback&year_from=1990&year_to=2000&acquired_from=2024-01-05&acquired_to=2024-02-10&on_loan=true&sort=title&order=desc';
    const first = renderBooks(lib(), `/books${search}`);
    await screen.findByRole('button', { name: 'Filtri (11)' });
    const sent = last(first.platform);
    expect(first.router.state.location.search).toBe(search);
    first.unmount();
    const second = renderBooks(lib(), `/books${first.router.state.location.search}`);
    await screen.findByRole('button', { name: 'Filtri (11)' });
    expect(last(second.platform).toString()).toBe(sent.toString());
  });

  it('ignores invalid values without an error', async () => {
    const { platform } = renderBooks(lib(), '/books?reading=zzz&year_from=abc&acquired_to=32-13-2024&sort=bogus&order=up&tag=');
    await screen.findByRole('link', { name: 'Libro 1 Autore 1' });
    const p = last(platform);
    for (const k of ['reading', 'year_from', 'acquired_to', 'sort', 'order', 'tag_id']) expect(p.has(k)).toBe(false);
    expect(screen.getByRole('button', { name: 'Filtri' })).toBeInTheDocument();
  });

  it('opens "New book" for ?new=1 and removes the parameter', async () => {
    const { router } = renderBooks(lib(), '/books?new=1&genre=Giallo');
    expect(await screen.findByRole('dialog', { name: 'Nuovo libro' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?genre=Giallo');
  });

  it('does not open "New book" for a guest, but still drops the parameter', async () => {
    const { router } = renderBooks({ ...lib(), role: 'guest' }, '/books?new=1');
    await screen.findByRole('link', { name: 'Libro 1 Autore 1' });
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('sorting', () => {
  it('sorts from the menu, and the headers of the list follow', async () => {
    const { platform, router } = renderBooks(lib(), '/books?view=list');
    await userEvent.click(await screen.findByRole('button', { name: 'Ordina per: Data di inserimento' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Autore' }));
    await waitFor(() => expect(last(platform).get('sort')).toBe('author'));
    expect(last(platform).get('order')).toBe('asc');
    expect(screen.getByRole('columnheader', { name: 'Autore' })).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(screen.getByRole('button', { name: 'Ordina per: Autore' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Decrescente' }));
    await waitFor(() => expect(last(platform).get('order')).toBe('desc'));
    expect(screen.getByRole('columnheader', { name: 'Autore' })).toHaveAttribute('aria-sort', 'descending');
    expect(router.state.location.search).toContain('order=desc');
  });

  it('sorts from a header and the menu shows the same key', async () => {
    const { platform } = renderBooks(lib(), '/books?view=list');
    await userEvent.click(await screen.findByRole('button', { name: 'Anno' }));
    await waitFor(() => expect(last(platform).get('sort')).toBe('published_year'));
    expect(screen.getByRole('button', { name: 'Ordina per: Anno di pubblicazione' })).toBeInTheDocument();
  });

  it('offers every sort of the contract; the newest-first default is explicit', async () => {
    const { platform } = renderBooks(lib(), '/books');
    await userEvent.click(await screen.findByRole('button', { name: /^Ordina per/ }));
    const names = (await screen.findAllByRole('menuitem')).map((i) => i.textContent);
    expect(names).toEqual([
      'Data di inserimento',
      'Titolo',
      'Autore',
      'Anno di pubblicazione',
      'Data d’acquisto',
      'Pagine',
      'Numero progressivo',
      'Voto',
      'Crescente',
      'Decrescente',
    ]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Voto' }));
    await waitFor(() => expect(last(platform).get('sort')).toBe('rating'));
    expect(last(platform).get('order')).toBe('asc');
  });
});
