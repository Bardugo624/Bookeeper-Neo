import { useState } from 'react';
import type { QuoteEntry, QuoteLang } from './data';
import { nextQuote } from './deck';

// StrictMode runs a state initializer twice in a row during development: both calls of one render get one card.
let justPicked: { lang: QuoteLang; entry: QuoteEntry } | null = null;

function pickOnce(lang: QuoteLang): QuoteEntry {
  if (justPicked?.lang === lang) return justPicked.entry;
  const entry = nextQuote(lang);
  justPicked = { lang, entry };
  queueMicrotask(() => {
    justPicked = null;
  });
  return entry;
}

/** One card per mount; a language change takes the next card of the new language only when the shown entry has no text in it. */
export function useOpeningQuote(lang: QuoteLang): QuoteEntry {
  const [entry, setEntry] = useState(() => pickOnce(lang));
  if (entry[lang]) return entry;
  const next = pickOnce(lang);
  setEntry(next);
  return next;
}
