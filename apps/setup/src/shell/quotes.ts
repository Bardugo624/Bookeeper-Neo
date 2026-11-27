import { useCallback, useRef } from 'react';
import type { Locale } from '@bookeeper/i18n';
import { QUOTES, quoteText, type QuoteEntry } from '@bookeeper/ui/quote';
import { useLocale } from './i18n';

/** A quote chosen by `useQuotes`; the text is looked up in the language on show. */
export interface QuoteRef {
  id: string;
}

export interface ShownQuote {
  id: string;
  text: string;
  author: string;
  work: string | null;
}

export type QuoteKind = 'welcome' | 'progress' | 'farewell';

/** The characters of a quote that fit the compact frontispiece (two lines at 22px), and the longest one that fits at all. */
export const COMPACT_MAX = 110;
/** The compact frontispiece holds two lines: a quote in verse may break once at most. */
export const COMPACT_MAX_BREAKS = 1;
export const FULL_MAX = 200;
/** A new quote during the work comes at most this often. */
export const QUOTE_INTERVAL_MS = 6000;

function byId(id: string): QuoteEntry | undefined {
  return QUOTES.find((q) => q.id === id);
}

export function quoteLength(q: QuoteEntry, locale: Locale): number {
  return q[locale]?.text.length ?? 0;
}

/** `null` when the quote has no text in the language on show. */
export function resolveQuote(ref: QuoteRef, locale: Locale): ShownQuote | null {
  const t = quoteText(ref.id, locale);
  return t ? { id: ref.id, text: t.text, author: t.author, work: t.work } : null;
}

// The welcome and the farewell sit under the compact frontispiece too.
function fits(q: QuoteEntry, locale: Locale, kind: QuoteKind): boolean {
  const text = q[locale]?.text;
  if (text === undefined) return false;
  if (kind === 'progress') return text.length <= FULL_MAX;
  return text.length <= COMPACT_MAX && (text.match(/\n/g)?.length ?? 0) <= COMPACT_MAX_BREAKS;
}

/** The quotes a kind may show, in the language on show. */
export function pool(kind: QuoteKind, locale: Locale): QuoteEntry[] {
  return QUOTES.filter((q) => fits(q, locale, kind));
}

function shortest(locale: Locale): QuoteEntry {
  return QUOTES.filter((q) => q[locale] !== null).reduce((a, b) => (quoteLength(b, locale) < quoteLength(a, locale) ? b : a));
}

/**
 * Picks quotes in the language on show. Call `pick` from an event handler or an effect, not while rendering.
 * `welcome` and `farewell` keep their quote; `progress` moves on to another one, but no more often than every 6 s.
 */
export function useQuotes(random: () => number = Math.random): { pick(kind: QuoteKind): QuoteRef } {
  const locale = useLocale();
  const current = useRef<{ id: string; kind: QuoteKind; at: number } | null>(null);

  const pick = useCallback(
    (kind: QuoteKind): QuoteRef => {
      const now = Date.now();
      const shown = current.current;
      const shownQuote = shown ? byId(shown.id) : undefined;
      const stillFits = shownQuote !== undefined && fits(shownQuote, locale, kind);
      if (shown && shown.kind === kind && stillFits && (kind !== 'progress' || now - shown.at < QUOTE_INTERVAL_MS)) {
        return { id: shown.id };
      }
      const candidates = pool(kind, locale);
      const fresh = candidates.filter((q) => q.id !== shown?.id);
      // With no quote that fits, the shortest one is the least likely to overflow.
      const from = fresh.length > 0 ? fresh : candidates.length > 0 ? candidates : [shortest(locale)];
      const chosen = from[Math.min(from.length - 1, Math.floor(random() * from.length))]!;
      current.current = { id: chosen.id, kind, at: now };
      return { id: chosen.id };
    },
    [locale, random],
  );

  return { pick };
}
