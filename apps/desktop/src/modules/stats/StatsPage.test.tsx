import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { OVERVIEW, reduceMotion, renderStats, stats } from './testkit';

beforeEach(reduceMotion);

const many = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `Genere ${i + 1}`, count: 100 - i }));

describe('totals', () => {
  it('shows a card per core total with its final value', async () => {
    renderStats({ stats: stats() });
    await screen.findByRole('heading', { name: 'Statistiche' });
    const labels: Record<string, string> = {
      total_books: 'Libri',
      total_authors: 'Autori',
      total_shelves: 'Scaffali',
      total_pages: 'Pagine',
      wishlist_count: 'Wishlist',
      active_loans: 'Prestiti attivi',
      overdue_loans: 'Prestiti in ritardo',
      returned_loans: 'Prestiti restituiti',
    };
    for (const [k, label] of Object.entries(labels)) {
      const card = (await screen.findByText(label)).closest('div')!.parentElement!;
      expect(within(card).getAllByText(String(OVERVIEW[k as keyof typeof OVERVIEW])).length).toBeGreaterThan(0);
    }
  });

  it('translates the labels', async () => {
    renderStats({ stats: stats() }, 'en');
    expect(await screen.findByText('Overdue loans')).toBeInTheDocument();
  });
});

const bodyRows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1);

describe('distributions', () => {
  it('lists rows by count and exposes values as a table', async () => {
    renderStats({ stats: stats({ by_format: [{ key: 'Brossura', count: 9 }, { key: 'Rilegato', count: 3 }] }) });
    const table = await screen.findByRole('table');
    const rows = bodyRows(table);
    expect(rows.map((r) => r.textContent)).toEqual(['Brossura9', 'Rilegato3']);
    expect(within(rows[0]!).getByRole('rowheader', { name: 'Brossura' })).toBeInTheDocument();
  });

  it('shows ten rows, then everything on request', async () => {
    renderStats({ stats: stats({ by_genre: many(14) }) });
    const table = await screen.findByRole('table');
    expect(bodyRows(table)).toHaveLength(10);
    const more = screen.getByRole('button', { name: 'Mostra tutto (14)' });
    await userEvent.click(more);
    expect(bodyRows(table)).toHaveLength(14);
    expect(screen.getByRole('button', { name: 'Mostra meno' })).toBeInTheDocument();
  });

  it('has no show-all button for ten rows or fewer', async () => {
    renderStats({ stats: stats({ by_genre: many(10) }) });
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Mostra tutto/ })).not.toBeInTheDocument();
  });

  it('labels the empty category', async () => {
    renderStats({ stats: stats({ by_language: [{ key: 'it', count: 2 }, { key: '', count: 5 }] }) });
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('rowheader', { name: 'Non indicato' })).toBeInTheDocument();
  });

  it('skips distributions the library does not have', async () => {
    renderStats({ stats: stats() });
    await screen.findByText('Libri');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('shelf fill', () => {
  const fill = (id: string, pct: number) => ({ id, name: `Mobile ${id}`, color: '#abc', capacity: 100, used: Math.round(pct * 100), pct });

  it('uses automatic tones at the thresholds', async () => {
    renderStats({ stats: stats({ shelf_fill: [fill('a', 0.5), fill('b', 0.8), fill('c', 0.97)] }) });
    const tone = async (name: string) => (await screen.findByRole('progressbar', { name })).getAttribute('data-tone');
    expect(await tone('Mobile a: 50% pieno')).toBe('ok');
    expect(await tone('Mobile b: 80% pieno')).toBe('warn');
    expect(await tone('Mobile c: 97% pieno')).toBe('danger');
  });

  it('links each unit to the shelves view', async () => {
    const { router } = renderStats({ stats: stats({ shelf_fill: [fill('u1', 0.2)] }) });
    await userEvent.click(await screen.findByRole('link', { name: 'Mobile u1' }));
    expect(router.state.location.pathname + router.state.location.search).toBe('/shelves?unit=u1');
  });
});

describe('states', () => {
  it('shows skeletons on the same grid while loading', async () => {
    renderStats({ stats: stats(), pending: true });
    const status = await screen.findByRole('status', { name: 'Caricamento delle statistiche' });
    expect(status.querySelectorAll('[aria-hidden="true"]').length).toBe(8 + 5);
    expect(screen.getByRole('heading', { name: 'Statistiche' })).toBeInTheDocument();
  });

  it('shows the empty state with a way to books', async () => {
    const { router } = renderStats({ stats: stats({ overview: { ...OVERVIEW, total_books: 0 } }) });
    expect(await screen.findByText('Ancora nessuna statistica')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Vai ai libri' }));
    expect(router.state.location.pathname).toBe('/books');
  });

  it('shows an error with a retry that recovers', async () => {
    const backend = { stats: stats(), fails: true };
    renderStats(backend);
    expect(await screen.findByText('Impossibile caricare le statistiche')).toBeInTheDocument();
    backend.fails = false;
    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(await screen.findByText('Prestiti attivi')).toBeInTheDocument();
  });
});
