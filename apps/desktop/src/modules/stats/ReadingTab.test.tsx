import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { reduceMotion, readingStats, renderStats, stats } from './testkit';

beforeEach(reduceMotion);

// jsdom lacks the pointer-capture and scroll APIs Radix Select calls.
const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
proto.hasPointerCapture ??= () => false;
proto.setPointerCapture ??= () => undefined;
proto.releasePointerCapture ??= () => undefined;
proto.scrollIntoView ??= () => undefined;

const byMonth = [1, 0, 3, 0, 0, 2, 0, 0, 0, 0, 0, 4];
const FULL = readingStats(
  {
    year: 2024,
    books: 10,
    pages: 3210,
    by_month: byMonth,
    by_genre: [{ value: 'Romanzo', count: 6 }, { value: null, count: 2 }],
    days: [
      { date: '2024-01-05', books: 1 },
      { date: '2024-03-10', books: 2 },
      { date: '2024-03-11', books: 3 },
      { date: '2024-12-31', books: 9 },
    ],
    rated: { count: 4, average: 4.25 },
    longest: { book_id: 'b9', title: 'Il librone', page_count: 900 },
  },
  [{ year: 2024, books: 10, pages: 3210 }, { year: 2023, books: 1, pages: 100 }],
);

const open = (reading = FULL, extra: Record<string, unknown> = {}) => {
  const readingYears: (string | null)[] = [];
  const out = renderStats({ stats: stats(), reading, readingYears, ...extra });
  return { ...out, readingYears };
};

describe('tabs and address', () => {
  it('switches to Lettura and keeps it in the address', async () => {
    const { router } = open();
    await userEvent.click(await screen.findByRole('tab', { name: 'Lettura' }));
    await screen.findByText('Libri letti');
    expect(router.state.location.search).toBe('?tab=reading');
    await userEvent.click(screen.getByRole('tab', { name: 'Libreria' }));
    expect(router.state.location.search).toBe('');
  });

  it('opens on the tab and year of the address and asks for that year', async () => {
    const { router, readingYears } = renderStatsAt('/stats?tab=reading&year=2023');
    await screen.findByText('Libri letti');
    expect(readingYears).toContain('2023');
    expect(router.state.location.search).toBe('?tab=reading&year=2023');
  });

  it('changes year from the selector', async () => {
    const { router, readingYears } = open();
    await userEvent.click(await screen.findByRole('tab', { name: 'Lettura' }));
    await userEvent.click(await screen.findByRole('combobox', { name: 'Anno di lettura' }));
    await userEvent.click(await screen.findByRole('option', { name: '2023' }));
    expect(router.state.location.search).toContain('year=2023');
    expect(readingYears).toContain('2023');
  });
});

function renderStatsAt(route: string) {
  const readingYears: (string | null)[] = [];
  const out = renderStats({ stats: stats(), reading: FULL, readingYears }, 'it', route);
  return { ...out, readingYears };
}

describe('values', () => {
  beforeEach(async () => {
    renderStatsAt('/stats?tab=reading');
    await screen.findByText('Libri letti');
  });

  it('shows the cards', () => {
    const value = (label: string) => screen.getByText(label).closest('div')!.parentElement!;
    expect(within(value('Libri letti')).getAllByText('10').length).toBeGreaterThan(0);
    expect(within(value('Pagine')).getAllByText('3210').length).toBeGreaterThan(0);
    expect(within(value('Valutazione media')).getByText('4,3')).toBeInTheDocument();
  });

  it('draws twelve columns and the same numbers in a table', () => {
    const rects = document.querySelectorAll('rect[data-month]');
    expect(rects).toHaveLength(12);
    const table = screen.getByRole('table', { name: 'Libri letti per mese nel 2024' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(byMonth.map(String));
    expect(within(rows[11]!).getByRole('rowheader')).toHaveTextContent('dicembre');
  });

  it('draws one cell per day of a leap year with the intensity of the day', () => {
    const cells = within(screen.getByRole('group', { name: 'Giorni di lettura del 2024' })).getAllByRole('img');
    expect(cells).toHaveLength(366);
    const level = (date: string) => cells.find((c) => c.getAttribute('aria-label')!.includes(date))!.getAttribute('data-level');
    expect(level('5 gennaio 2024')).toBe('1');
    expect(level('10 marzo 2024')).toBe('2');
    expect(level('11 marzo 2024')).toBe('3');
    expect(level('31 dicembre 2024')).toBe('4');
    expect(level('1 gennaio 2024')).toBe('0');
  });

  it('gives each cell an accessible title', () => {
    expect(screen.getByRole('img', { name: '2 libri il 10 marzo 2024' })).toHaveAttribute('title', '2 libri il 10 marzo 2024');
    expect(screen.getByRole('img', { name: '1 libro il 5 gennaio 2024' })).toBeInTheDocument();
  });

  it('lists genres and links the longest book', () => {
    expect(screen.getByRole('progressbar', { name: 'Romanzo: 6', hidden: true })).toBeInTheDocument();
    expect(screen.getByText('Non indicato')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Il librone' })).toHaveAttribute('href', '/books/b9');
  });
});

it('counts 365 cells in a common year', async () => {
  renderStats({ stats: stats(), reading: readingStats({ year: 2023, books: 1, days: [{ date: '2023-02-01', books: 1 }] }) }, 'it', '/stats?tab=reading&year=2023');
  const group = await screen.findByRole('group', { name: 'Giorni di lettura del 2023' });
  expect(within(group).getAllByRole('img')).toHaveLength(365);
});

it('invites to mark a book as read when the year is empty', async () => {
  const { router } = renderStats({ stats: stats(), reading: readingStats({ year: 2022 }) }, 'it', '/stats?tab=reading&year=2022');
  expect(await screen.findByText('Nessuna lettura nel 2022')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Il tuo anno in libri' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Vai ai libri' }));
  expect(router.state.location.pathname).toBe('/books');
});

it('shows an error with retry', async () => {
  renderStats({ stats: stats(), readingFails: true }, 'it', '/stats?tab=reading');
  expect(await screen.findByText('Impossibile caricare la lettura')).toBeInTheDocument();
});
