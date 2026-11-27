import { expect, it } from 'vitest';
import { QUOTES, quotesIn, quoteText } from './data';

it('has no entry with a null text in its own language', () => {
  expect(quotesIn('en').every((q) => q.en !== null)).toBe(true);
  expect(quotesIn('it').every((q) => q.it !== null)).toBe(true);
  expect(QUOTES.some((q) => q.en === null)).toBe(true);
});
it('counts the verified quotes', () => {
  expect(quotesIn('it')).toHaveLength(80);
  expect(quotesIn('en')).toHaveLength(48);
});
it('finds a text by id and language', () => {
  const q = quotesIn('en')[0]!;
  expect(quoteText(q.id, 'en')).toBe(q.en);
  expect(quoteText('nope', 'it')).toBeNull();
  const onlyIt = QUOTES.find((e) => e.en === null)!;
  expect(quoteText(onlyIt.id, 'en')).toBeNull();
});
