import raw from './quotes.json';

export type QuoteLang = 'it' | 'en';
export interface QuoteText {
  text: string;
  author: string;
  work: string | null;
}
export interface QuoteEntry {
  id: string;
  it: QuoteText | null;
  en: QuoteText | null;
}

export const QUOTES: readonly QuoteEntry[] = raw as QuoteEntry[];

/** Entries with a text in `lang`, in file order. */
export function quotesIn(lang: QuoteLang): QuoteEntry[] {
  return QUOTES.filter((q) => q[lang] !== null);
}

export function quoteText(id: string, lang: QuoteLang): QuoteText | null {
  return QUOTES.find((q) => q.id === id)?.[lang] ?? null;
}
