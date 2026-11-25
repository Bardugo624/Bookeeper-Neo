import type { ListBooksParams } from '@bookeeper/api';

/** Reading states the API filters on. */
export const READING_STATES = ['to_read', 'reading', 'read', 'abandoned', 'none'] as const;
export type ReadingState = (typeof READING_STATES)[number];

/** Values of `sort` the API orders by (the 4A contract), in the order of the menu. */
export const SORT_KEYS = [
  'created_at',
  'title',
  'author',
  'published_year',
  'acquired_at',
  'page_count',
  'progressive_number',
  'rating',
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortOrder = 'asc' | 'desc';

/** The API orders `created_at` newest first unless told otherwise, the other keys ascending. */
export const defaultOrder = (key: SortKey): SortOrder => (key === 'created_at' ? 'desc' : 'asc');

export function parseOrder(raw: string | null, key: SortKey | null): SortOrder {
  return raw === 'asc' || raw === 'desc' ? raw : key ? defaultOrder(key) : 'asc';
}

/** Older addresses used these names. */
const SORT_ALIASES: Record<string, SortKey> = { year: 'published_year', progressive: 'progressive_number' };

export function parseSort(raw: string | null): SortKey | null {
  if (raw === null) return null;
  return SORT_KEYS.find((k) => k === raw) ?? SORT_ALIASES[raw] ?? null;
}

/** Everything the panel can narrow the list by. Dates are `yyyy-mm-dd`. */
export interface Filters {
  reading: ReadingState | null;
  onLoan: boolean;
  unshelved: boolean;
  tags: string[];
  room: string | null;
  shelf: string | null;
  genre: string | null;
  language: string | null;
  format: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  acquiredFrom: string | null;
  acquiredTo: string | null;
}

export const NO_FILTERS: Filters = {
  reading: null,
  onLoan: false,
  unshelved: false,
  tags: [],
  room: null,
  shelf: null,
  genre: null,
  language: null,
  format: null,
  yearFrom: null,
  yearTo: null,
  acquiredFrom: null,
  acquiredTo: null,
};

/** Address keys written by `writeFilters`, apart from the legacy `filter`. */
const KEYS = [
  'reading',
  'on_loan',
  'tag',
  'room',
  'shelf',
  'genre',
  'language',
  'format',
  'year_from',
  'year_to',
  'acquired_from',
  'acquired_to',
] as const;

const text = (p: URLSearchParams, key: string): string | null => p.get(key)?.trim() || null;
const year = (raw: string | null): number | null => (raw !== null && /^\d{1,4}$/.test(raw) ? Number(raw) : null);

/** `yyyy-mm-dd` of a real calendar day, or null. */
export function validDate(raw: string | null): string | null {
  if (raw === null || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const ms = Date.parse(`${raw}T00:00:00Z`);
  return Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== raw ? null : raw;
}

/** Reads the filters from an address; anything invalid counts as absent. */
export function parseFilters(p: URLSearchParams): Filters {
  const legacy = p.get('filter');
  return {
    reading: READING_STATES.find((s) => s === p.get('reading')) ?? null,
    onLoan: p.get('on_loan') === 'true' || legacy === 'loan',
    unshelved: legacy === 'unshelved',
    tags: [...new Set(p.getAll('tag').map((v) => v.trim()).filter(Boolean))],
    room: text(p, 'room'),
    shelf: text(p, 'shelf'),
    genre: text(p, 'genre'),
    language: text(p, 'language'),
    format: text(p, 'format'),
    yearFrom: year(p.get('year_from')),
    yearTo: year(p.get('year_to')),
    acquiredFrom: validDate(p.get('acquired_from')),
    acquiredTo: validDate(p.get('acquired_to')),
  };
}

/** Writes the filters into `p`, replacing what was there. A loan filter is always `on_loan=true` here. */
export function writeFilters(p: URLSearchParams, f: Filters): void {
  for (const k of KEYS) p.delete(k);
  p.delete('filter');
  const set = (k: string, v: string | number | null) => {
    if (v !== null) p.set(k, String(v));
  };
  set('reading', f.reading);
  set('on_loan', f.onLoan ? 'true' : null);
  set('filter', f.unshelved ? 'unshelved' : null);
  for (const id of f.tags) p.append('tag', id);
  set('room', f.room);
  set('shelf', f.shelf);
  set('genre', f.genre);
  set('language', f.language);
  set('format', f.format);
  set('year_from', f.yearFrom);
  set('year_to', f.yearTo);
  set('acquired_from', f.acquiredFrom);
  set('acquired_to', f.acquiredTo);
}

/** Unix seconds of the start of a local calendar day, `shift` days away. */
function localDay(d: string, shift = 0): number {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return Math.floor(new Date(y, m - 1, day + shift).getTime() / 1000);
}

/** Query of `GET /books` for the filters; absent values stay out. */
export function toApiFilters(f: Filters): ListBooksParams {
  return {
    reading: f.reading ?? undefined,
    on_loan: f.onLoan ? true : undefined,
    unshelved: f.unshelved ? true : undefined,
    tag_id: f.tags.length ? f.tags : undefined,
    room_id: f.room ?? undefined,
    shelf_id: f.shelf ?? undefined,
    genre: f.genre ?? undefined,
    language: f.language ?? undefined,
    format: f.format ?? undefined,
    year_from: f.yearFrom ?? undefined,
    year_to: f.yearTo ?? undefined,
    acquired_from: f.acquiredFrom ? localDay(f.acquiredFrom) : undefined,
    // The whole last day counts.
    acquired_to: f.acquiredTo ? localDay(f.acquiredTo, 1) - 1 : undefined,
  };
}

export const sameFilters = (a: Filters, b: Filters): boolean => {
  const p = new URLSearchParams();
  const q = new URLSearchParams();
  writeFilters(p, a);
  writeFilters(q, b);
  p.sort();
  q.sort();
  return p.toString() === q.toString();
};

/** The part of the address a saved view keeps: search, filters and sort. */
export function serializeView(v: { q: string; filters: Filters; sort: SortKey | null; order: SortOrder }): string {
  const p = new URLSearchParams();
  if (v.q.trim()) p.set('q', v.q.trim());
  writeFilters(p, v.filters);
  if (v.sort) {
    p.set('sort', v.sort);
    if (v.order !== defaultOrder(v.sort)) p.set('order', v.order);
  }
  return p.toString();
}
