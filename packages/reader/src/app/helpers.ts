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

type T = (key: string, vars?: Record<string, string | number>) => string;

/**
 * When a position was saved: «adesso», «alle 15:49», «ieri alle 22:40»,
 * «il 26 novembre», «il 26 novembre 2025», in the reader's language.
 */
export function sinceText(t: T, locale: string, atSeconds: number, nowMs: number = Date.now()): string {
  const loc = locale.startsWith('en') ? 'en-GB' : locale;
  const at = new Date(atSeconds * 1000);
  const now = new Date(nowMs);
  if (Math.abs(nowMs - atSeconds * 1000) < 60_000) return t('reader.resume.when_now');
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const time = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days === 0) return t('reader.resume.when_today', { time });
  if (days === 1) return t('reader.resume.when_yesterday', { time });
  const date =
    at.getFullYear() === now.getFullYear()
      ? new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long' }).format(at)
      : new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric' }).format(at);
  return t('reader.resume.when_date', { date });
}
