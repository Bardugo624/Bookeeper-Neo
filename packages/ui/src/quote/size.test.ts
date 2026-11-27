import { expect, it } from 'vitest';
import { quoteSize } from './size';

const col = { columnPx: 348 };
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
