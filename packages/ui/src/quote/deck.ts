import { quotesIn, type QuoteEntry, type QuoteLang } from './data';

export interface DeckOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  random?: () => number;
}

interface Deck {
  order: string[];
  next: number;
}

function defaultStorage(): DeckOptions['storage'] {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function shuffle(ids: string[], random: () => number): string[] {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function readDeck(raw: string | null, ids: string[]): Deck | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Deck> | null;
    if (!v || !Array.isArray(v.order) || !Number.isInteger(v.next)) return null;
    const { order, next } = v as Deck;
    if (next < 0 || next > order.length || order.length !== ids.length) return null;
    const set = new Set(order);
    if (set.size !== ids.length || !ids.every((id) => set.has(id))) return null;
    return { order, next };
  } catch {
    return null;
  }
}

/** The next card of the deck of `lang`. Never throws: without a usable storage the pick is random. */
export function nextQuote(lang: QuoteLang, opts: DeckOptions = {}): QuoteEntry {
  const random = opts.random ?? Math.random;
  const group = quotesIn(lang);
  const byId = new Map(group.map((q) => [q.id, q]));
  const ids = group.map((q) => q.id);
  const key = `bookeeper.quotes.${lang}`;
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;

  let saved: string | null = null;
  try {
    saved = storage ? storage.getItem(key) : null;
  } catch {
    saved = null;
  }

  let deck = readDeck(saved, ids);
  if (!deck || deck.next >= deck.order.length) {
    // A finished deck is replaced by a new one that must not open with the last card out.
    const last = deck?.order[deck.order.length - 1];
    const order = shuffle(ids, random);
    if (order.length > 1 && order[0] === last) [order[0], order[1]] = [order[1]!, order[0]!];
    deck = { order, next: 0 };
  }

  const id = deck.order[deck.next]!;
  try {
    storage?.setItem(key, JSON.stringify({ order: deck.order, next: deck.next + 1 }));
  } catch {
    /* a full or blocked storage only costs us the memory */
  }
  return byId.get(id)!;
}
