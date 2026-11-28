import { expect, it } from 'vitest';
import advances from './advances.json';
import { QUOTES, quoteText, type QuoteLang } from './data';
import { quoteSize } from './size';

const col = { columnPx: 348 };
const text = (id: string, lang: QuoteLang) => quoteText(id, lang)!.text;
it('scales prose by length', () => {
  expect(quoteSize('a'.repeat(51), col)).toBe(33);
  expect(quoteSize('a'.repeat(90), col)).toBe(33);
  expect(quoteSize('a'.repeat(91), col)).toBe(26);
  expect(quoteSize('a'.repeat(140), col)).toBe(26);
  expect(quoteSize('a'.repeat(141), col)).toBe(22);
});
it('is always 22 when compact', () => {
  expect(quoteSize('a', { ...col, compact: true })).toBe(22);
  expect(quoteSize('a\nb', { ...col, compact: true })).toBe(22);
});
it('counts code points', () => {
  expect(quoteSize('😀'.repeat(90), col)).toBe(33);
});
it('fits verses to the column', () => {
  expect(quoteSize('a\nb', col)).toBe(33);
  expect(quoteSize(`${'a'.repeat(31)}\nb`, col)).toBeLessThanOrEqual(22);
  expect(quoteSize(`${'a'.repeat(34)}\nb`, col)).toBe(22);
  expect(quoteSize(`${'a'.repeat(31)}\nb`, { columnPx: 600 })).toBe(33);
});
it('measures verses with the advances of Lora', () => {
  expect(quoteSize(text('umberto-saba-1', 'it'), col)).toBe(22);
  expect(quoteSize(text('emily-dickinson-1', 'en'), col)).toBe(22);
  expect(quoteSize(text('dante-alighieri-2', 'it'), { columnPx: 600 })).toBe(26);
  expect(quoteSize(text('jorge-luis-borges-1', 'it'), { columnPx: 600 })).toBe(22);
});
it('carries verses on at 22 when one does not fit even at 20', () => {
  expect(quoteSize(text('emily-dickinson-1', 'it'), col)).toBe(22);
});
it('counts a character Lora lacks as the widest one', () => {
  const [widest] = Object.entries(advances).reduce((a, b) => (b[1] > a[1] ? b : a));
  const verse = (ch: string) => `${ch.repeat(13)}\nb`;
  expect(quoteSize(verse('一'), col)).toBe(quoteSize(verse(widest), col));
  expect(quoteSize(verse('i'), col)).toBe(33);
});
it('has an advance for every character of the quotes', () => {
  const chars = new Set(['«', '»']);
  for (const q of QUOTES) for (const t of [q.it, q.en]) for (const ch of t?.text.replace(/\n/g, '') ?? '') chars.add(ch);
  expect([...chars].filter((ch) => !(ch in advances))).toEqual([]);
});
