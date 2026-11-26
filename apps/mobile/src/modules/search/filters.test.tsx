import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { book, listCalls, renderSearch, type Api } from './testkit';

const tagged = (n: number, ...ids: string[]) =>
  book(n, { tags: ids.map((id) => ({ id, name: `Nome ${id}`, color: 'sage' })) } as never);
const rows = () => within(screen.getByRole('list', { name: 'Libri' })).getAllByRole('link');
const api = (over: Partial<Api> = {}): Api => ({
  books: [tagged(1, 't1'), tagged(2, 't1', 't2'), tagged(3)],
  rooms: [{ id: 'r1', name: 'Salotto' }],
  facets: { tags: [{ id: 't1', name: 'Giallo', color: 'sage', count: 2 }, { id: 't2', name: 'Storia', color: 'plum', count: 1 }], reading: { to_read: 4, read: 2 } },
  reading: { b1: 'read', b2: 'to_read' },
  ...over,
});
const last = (p: ReturnType<typeof renderSearch>['platform']) => listCalls(p).at(-1) ?? '';

describe('address → state → request', () => {
  it.each([
    ['reading=read', 'reading=read'],
    ['room=r1', 'room_id=r1'],
    ['tag=t1', 'tag_id=t1'],
  ])('%s is sent as %s', async (query, sent) => {
    const { platform } = renderSearch({ api: api(), route: `/search?${query}` });
    await screen.findByRole('searchbox');
    await waitFor(() => expect(listCalls(platform)[0]).toContain(sent));
  });

  it('sends several tags as repeated keys, and ignores unknown values', async () => {
    const { platform } = renderSearch({ api: api(), route: '/search?tag=t1&tag=t2&reading=bogus&filter=zzz' });
    await waitFor(() => expect(listCalls(platform)[0]).toContain('tag_id=t1&tag_id=t2'));
    expect(listCalls(platform)[0]).not.toContain('reading');
    expect(await screen.findAllByRole('link', { name: /Libro 2/ })).toHaveLength(1);
    expect(rows()).toHaveLength(1);
  });
});

describe('quick filters', () => {
  it('filters by reading state and combines with "In prestito"', async () => {
    const user = userEvent.setup();
    const { router, platform } = renderSearch({ api: api({ books: [tagged(1, 't1', 't2'), tagged(2), tagged(3)].map((b, i) => (i === 0 ? { ...b, on_loan: true } : b)) , reading: { b1: 'read', b2: 'read' } }) });
    await screen.findByRole('link', { name: /Libro 1/ });
    await user.click(screen.getByRole('button', { name: 'Letti' }));
    expect(router.state.location.search).toBe('?reading=read');
    await waitFor(() => expect(rows()).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'In prestito' }));
    expect(router.state.location.search).toBe('?reading=read&filter=loan');
    expect(screen.getByRole('button', { name: 'Letti' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'In prestito' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(last(platform)).toContain('on_loan=true'));
    expect(last(platform)).toContain('reading=read');
    await user.click(screen.getByRole('button', { name: 'Tutti' }));
    expect(router.state.location.search).toBe('');
  });
});

describe('the filter sheet', () => {
  it('shows choices with counts, applies on "Mostra N libri"', async () => {
    const user = userEvent.setup();
    const { router, platform } = renderSearch({ api: api() });
    await screen.findByRole('link', { name: /Libro 1/ });
    await user.click(screen.getByRole('button', { name: 'Filtri' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('checkbox', { name: /Giallo\s*2/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Da leggere\s*4/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Abbandonato 0' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Senza stato/ })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('checkbox', { name: /Giallo/ }));
    await user.click(within(dialog).getByRole('checkbox', { name: /Storia/ }));
    await user.click(await within(dialog).findByRole('button', { name: 'Salotto' }));
    expect(router.state.location.search).toBe('');
    await user.click(await within(dialog).findByRole('button', { name: 'Mostra 1 libro' }));
    expect(router.state.location.search).toBe('?tag=t1&tag=t2&room=r1');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(last(platform)).toContain('tag_id=t1&tag_id=t2'));
    expect(last(platform)).toContain('room_id=r1');
    expect(screen.getByRole('button', { name: 'Filtri 3' })).toBeInTheDocument();
  });

  it('"Azzera" clears the choices', async () => {
    const user = userEvent.setup();
    const { router } = renderSearch({ api: api(), route: '/search?tag=t1&room=r1&reading=read' });
    await user.click(await screen.findByRole('button', { name: 'Filtri 3' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: 'Azzera' }));
    await user.click(within(dialog).getByRole('button', { name: /^Mostra/ }));
    expect(router.state.location.search).toBe('');
  });

  it('hides the sections with nothing in them', async () => {
    const user = userEvent.setup();
    renderSearch({ api: api({ rooms: [], facets: { tags: [] } }) });
    await user.click(await screen.findByRole('button', { name: 'Filtri' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Stato di lettura');
    expect(within(dialog).queryByText('Tag')).toBeNull();
    expect(within(dialog).queryByText('Stanza')).toBeNull();
  });
});

describe('active filters', () => {
  it('names each filter and takes it off', async () => {
    const user = userEvent.setup();
    const { router } = renderSearch({ api: api(), route: '/search?reading=read&tag=t1&tag=t2&room=r1' });
    const list = await screen.findByRole('list', { name: 'Filtri attivi' });
    expect(await within(list).findByText('Tag: Giallo')).toBeInTheDocument();
    expect(within(list).getByText('Stato: Letti')).toBeInTheDocument();
    expect(await within(list).findByText('Stanza: Salotto')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Togli il filtro Tag: Giallo' }));
    expect(router.state.location.search).toBe('?reading=read&tag=t2&room=r1');
    await user.click(screen.getByRole('button', { name: 'Togli il filtro Stanza: Salotto' }));
    await user.click(screen.getByRole('button', { name: 'Togli il filtro Stato: Letti' }));
    expect(router.state.location.search).toBe('?tag=t2');
  });

  it('offers "Azzera i filtri" when nothing matches, and keeps the filters coming back from a book', async () => {
    const user = userEvent.setup();
    const { router } = renderSearch({ api: api(), route: '/search?tag=t2&reading=abandoned' });
    expect(await screen.findByText('Nessun libro corrisponde a questi filtri.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Azzera i filtri' }));
    expect(router.state.location.search).toBe('');
    expect(await screen.findByRole('link', { name: /Libro 1/ })).toBeInTheDocument();
  });

  it('returns from the book with the same filters', async () => {
    const user = userEvent.setup();
    const { router } = renderSearch({ api: api(), route: '/search?tag=t2&reading=to_read' });
    await user.click(await screen.findByRole('link', { name: /Libro 2/ }));
    await user.click(await screen.findByRole('link', { name: "Torna all'elenco" }));
    expect(router.state.location.search).toBe('?tag=t2&reading=to_read');
    expect(await screen.findByRole('link', { name: /Libro 2/ })).toBeInTheDocument();
  });
});

describe('the sheet when the server fails', () => {
  const fail = (path: string) => ({
    ...api(),
    override: (call: { path: string }) =>
      call.path.includes(path) ? { status: 500, body: { error_code: 'internal', message: 'x' } } : undefined,
  });

  it('keeps the five reading states and shows the error with "Riprova" in the tags section', async () => {
    const user = userEvent.setup();
    renderSearch({ api: fail('/books/facets') });
    await user.click(await screen.findByRole('button', { name: 'Filtri' }));
    const dialog = await screen.findByRole('dialog');
    for (const name of ['Da leggere', 'In lettura', 'Letti', 'Abbandonato', 'Senza stato']) {
      expect(await within(dialog).findByRole('button', { name })).toBeInTheDocument();
    }
    expect(await within(dialog).findByRole('button', { name: 'Riprova' })).toBeInTheDocument();
  });

  it('shows the room error with "Riprova"', async () => {
    const user = userEvent.setup();
    renderSearch({ api: fail('/rooms') });
    await user.click(await screen.findByRole('button', { name: 'Filtri' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('button', { name: 'Riprova' })).toBeInTheDocument();
  });
});

describe('the result count', () => {
  it('titles the list "Ultimi libri aggiunti" only with no text and no filter', async () => {
    renderSearch({ api: api(), route: '/search?reading=read' });
    await screen.findByRole('searchbox');
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    expect(screen.queryByText(/Ultimi libri aggiunti/)).toBeNull();
  });
});
