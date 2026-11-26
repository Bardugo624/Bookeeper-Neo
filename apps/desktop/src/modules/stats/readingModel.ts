import type { ReadingStats } from '@bookeeper/api';

export type ReadingYear = ReadingStats['year'];

/** Cells per level: 0 = no book, then four intensities (1, 2, 3, 4 or more books in the day). */
export const MAX_LEVEL = 4;
export const intensity = (books: number): number => (books <= 0 ? 0 : Math.min(MAX_LEVEL, Math.floor(books)));

export interface DayCell {
  /** `YYYY-MM-DD`, UTC. */
  date: string;
  books: number;
  level: number;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
}

const DAY_MS = 86_400_000;

/** One cell per day of the year (365 or 366), UTC, with the books the core counted for it. */
export function yearCells(year: number, days: { date: string; books: number }[]): DayCell[] {
  const byDate = new Map(days.map((d) => [d.date, d.books]));
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const cells: DayCell[] = [];
  for (let ms = start; ms < end; ms += DAY_MS) {
    const d = new Date(ms);
    const date = d.toISOString().slice(0, 10);
    const books = byDate.get(date) ?? 0;
    cells.push({ date, books, level: intensity(books), weekday: (d.getUTCDay() + 6) % 7 });
  }
  return cells;
}

/** Years to offer: the ones with readings, plus the one on screen. Most recent first. */
export function yearOptions(years: { year: number }[], current: number): number[] {
  return Array.from(new Set([...years.map((y) => y.year), current])).sort((a, b) => b - a);
}

/** Index (0-11) of the month with most books; `null` when no month has any. */
export function busiestMonth(byMonth: number[]): number | null {
  let best: number | null = null;
  byMonth.forEach((n, i) => {
    if (n > 0 && (best === null || n > byMonth[best]!)) best = i;
  });
  return best;
}

/** The genre with most books; books without a genre never win. */
export function topGenre(genres: ReadingYear['by_genre']): string | null {
  let best: { value: string; count: number } | null = null;
  for (const g of genres) {
    if (g.value && (best === null || g.count > best.count)) best = { value: g.value, count: g.count };
  }
  return best?.value ?? null;
}

export const dateFormatter = (locale: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });

export const monthName = (locale: string, index: number, style: 'short' | 'long') =>
  dateFormatter(locale, { month: style }).format(new Date(Date.UTC(2001, index, 1)));
