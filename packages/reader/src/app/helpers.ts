import type { TocItem } from '../engine/protocol';

/** Whole seconds since the epoch, like every time the server stores. */
export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export const SEARCH_URL = 'https://duckduckgo.com/?q=';
export const SEARCH_MAX_CHARS = 300;

/** The web search for a piece of the book: at most 300 characters, encoded. */
export function webSearchUrl(text: string): string {
  return SEARCH_URL + encodeURIComponent(Array.from(text).slice(0, SEARCH_MAX_CHARS).join(''));
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The label of the chapter that has this `href`. */
export function labelOfHref(toc: readonly TocItem[], href: string | null): string | null {
  if (href === null) return null;
  for (const item of toc) {
    if (item.href === href) return item.label;
    const inner = labelOfHref(item.children, href);
    if (inner) return inner;
  }
  return null;
}

/** The top-level chapter that holds this point of the book (0 to 1). */
export function chapterAtFraction(toc: readonly TocItem[], fraction: number): string | null {
  let found: string | null = null;
  let at = -Infinity;
  for (const item of toc) {
    if (item.fraction !== null && item.fraction <= fraction && item.fraction >= at) {
      found = item.label;
      at = item.fraction;
    }
  }
  return found;
}

/** «2 giorni fa», in the reader's language. */
export function sinceText(locale: string, atSeconds: number, nowMs: number = Date.now()): string {
  const diff = Math.round((atSeconds * 1000 - nowMs) / 1000);
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of units) if (abs >= size) return fmt.format(Math.round(diff / size), unit);
  return fmt.format(0, 'minute');
}
