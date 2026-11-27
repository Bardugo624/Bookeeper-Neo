import type { PutReading, ReadingOut } from '@bookeeper/api';

export const READING_STATUSES = ['to_read', 'reading', 'read', 'abandoned'] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

/** Longest note the core accepts. */
export const NOTE_MAX = 2000;

export function isStatus(value: string | null | undefined): value is ReadingStatus {
  return (READING_STATUSES as readonly string[]).includes(value ?? '');
}

/** Whole percent read, or `null` when it cannot be told (no total pages). */
export function percentOf(status: string, currentPage: number | null | undefined, pageCount: number | null | undefined): number | null {
  if (status === 'read') return 100;
  if (!pageCount || pageCount <= 0) return null;
  if (status === 'to_read') return 0;
  return Math.min(100, Math.round(((currentPage ?? 0) / pageCount) * 100));
}

/** Percent for the ring: full when read, else what the e-book file says, else the page over the total. */
export function ringPercent(
  reading: { status: string; current_page?: number | null; progress_percent?: number | null },
  pageCount: number | null | undefined,
): number | null {
  if (reading.status === 'read') return 100;
  const fromFile = reading.progress_percent;
  if (fromFile != null && Number.isFinite(fromFile)) return Math.max(0, Math.min(100, Math.round(fromFile)));
  return percentOf(reading.status, reading.current_page, pageCount);
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** The current state as a full `PUT` body (the route replaces the state), with `patch` applied. */
export function bodyFrom(reading: ReadingOut | null, patch: Partial<PutReading> = {}): PutReading {
  return {
    status: reading?.status ?? 'to_read',
    started_at: reading?.started_at ?? null,
    finished_at: reading?.finished_at ?? null,
    rating: reading?.rating ?? null,
    note: reading?.note ?? null,
    current_page: reading?.current_page ?? null,
    ...patch,
  };
}

/** Body for a change of status: the core fills the dates and the page it owns; rating and note stay. */
export function statusBody(reading: ReadingOut | null, status: ReadingStatus): PutReading {
  const base = { rating: reading?.rating ?? null, note: reading?.note ?? null };
  if (status === 'to_read') return { status, ...base };
  const started = { started_at: reading?.started_at ?? null };
  if (status === 'read') return { status, ...started, ...base };
  return { status, ...started, current_page: reading?.current_page ?? null, ...base };
}

/** What the core will most likely answer, to show at once. */
export function optimisticReading(bookId: string, body: PutReading, pageCount?: number | null, previous?: ReadingOut | null): ReadingOut {
  const now = nowSeconds();
  const status = body.status;
  const toRead = status === 'to_read';
  return {
    book_id: bookId,
    status,
    started_at: toRead ? null : (body.started_at ?? (status === 'reading' ? now : null)),
    finished_at: toRead ? null : (body.finished_at ?? (status === 'read' ? now : null)),
    rating: body.rating ?? null,
    note: body.note ?? null,
    current_page: toRead ? null : (body.current_page ?? (status === 'read' ? (pageCount ?? null) : null)),
    updated_at: now,
    // The position in the file is not part of this write: keep what the cache holds so the ring does not reset.
    progress_percent: previous?.progress_percent ?? null,
    progress_at: previous?.progress_at ?? null,
  };
}

/** Calendar day in the phone's time zone. */
export function formatDay(locale: string, unixSeconds: number): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(unixSeconds * 1000));
}
