import { useState } from 'react';
import type { QuoteEntry, QuoteLang } from './data';
import { nextQuote } from './deck';

/** One card per mount; a language change takes the next card of the new language only when the shown entry has no text in it. */
export function useOpeningQuote(lang: QuoteLang): QuoteEntry {
  const [entry, setEntry] = useState(() => nextQuote(lang));
  if (entry[lang]) return entry;
  const next = nextQuote(lang);
  setEntry(next);
  return next;
}
