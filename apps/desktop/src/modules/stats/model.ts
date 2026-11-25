import type { Stats } from '@bookeeper/api';
import type { IconName } from '@bookeeper/ui/base';

export type Overview = Stats['overview'];
export type Tone = 'neutral' | 'primary' | 'ok' | 'warn' | 'danger';

/** One StatCard per field of the core's overview; the record type keeps it exhaustive. */
export const TOTALS: Record<keyof Overview, { glyph: IconName; tone: Tone }> = {
  total_books: { glyph: 'book', tone: 'primary' },
  total_authors: { glyph: 'pencil', tone: 'primary' },
  total_shelves: { glyph: 'library', tone: 'neutral' },
  total_pages: { glyph: 'list', tone: 'neutral' },
  wishlist_count: { glyph: 'heart', tone: 'primary' },
  active_loans: { glyph: 'loans', tone: 'warn' },
  overdue_loans: { glyph: 'alert', tone: 'danger' },
  returned_loans: { glyph: 'check', tone: 'ok' },
};

export type DistributionKey = 'by_genre' | 'by_language' | 'by_format' | 'by_decade' | 'top_authors';

/** Distributions the core returns; `chronological` keeps the core's order (oldest decade first). */
export const DISTRIBUTIONS: { key: DistributionKey; chronological?: boolean }[] = [
  { key: 'by_genre' },
  { key: 'by_language' },
  { key: 'by_format' },
  { key: 'by_decade', chronological: true },
  { key: 'top_authors' },
];

/** Codes the core stores for formats (see import.rs `map_binding`) and the languages we translate. */
export const FORMAT_CODES = ['paperback', 'hardcover', 'ebook', 'audiobook'];
export const LANGUAGE_CODES = ['it', 'en', 'fr', 'de', 'es', 'pt', 'la'];

export interface Row {
  id: string;
  label: string;
  count: number;
}

/** The core marks the rest of the genres with this key. */
const OTHERS_KEY = '…';

/** Codes compare without padding and case: ` IT ` is `it`. */
export const normalizeKey = (key: string) => key.trim().toLowerCase();

/** Rows with readable labels, most frequent first; the empty and "others" buckets stay last. */
export function toRows(
  items: { key: string; count: number }[],
  opts: { chronological?: boolean; decade?: boolean; missing: string; others: string; decadeLabel: (d: string) => string; keyLabel?: (key: string) => string | undefined; normalizeKey?: boolean },
): Row[] {
  const rank = (k: string) => (k === '' ? 2 : k === OTHERS_KEY ? 1 : 0);
  const rows: { n: number; key: string; raw: string; count: number }[] = [];
  items.forEach((i, n) => {
    const key = opts.normalizeKey ? normalizeKey(i.key) : i.key;
    // Codes that differ only in case or padding are one value: their counts add up.
    const same = opts.normalizeKey ? rows.find((r) => r.key === key) : undefined;
    if (same) same.count += i.count;
    else rows.push({ n, key, raw: i.key.trim(), count: i.count });
  });
  rows.sort((a, b) => {
    const r = rank(a.key) - rank(b.key);
    if (r !== 0) return r;
    return opts.chronological ? a.n - b.n : b.count - a.count || a.n - b.n;
  });
  return rows.map((r) => ({
    id: r.key || '∅',
    label: r.key === '' ? opts.missing : r.key === OTHERS_KEY ? opts.others : opts.decade ? opts.decadeLabel(r.key) : (opts.keyLabel?.(r.key) ?? (opts.normalizeKey ? r.raw : r.key)),
    count: r.count,
  }));
}
