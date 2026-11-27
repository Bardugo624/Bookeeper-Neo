import { expect, it } from 'vitest';
import { quotesIn } from './data';
import { nextQuote } from './deck';

function memory(init: Record<string, string> = {}) {
  const m = { ...init };
  return { m, getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => void (m[k] = v) };
}
const random = () => 0.3;
const n = quotesIn('en').length;

it('deals a whole round without repeats, then never opens the next one with the last card', () => {
  const s = memory();
  const ids = Array.from({ length: n }, () => nextQuote('en', { storage: s, random }).id);
  expect(new Set(ids)).toEqual(new Set(quotesIn('en').map((q) => q.id)));
  expect(ids).toHaveLength(n);
  for (let round = 0; round < 5; round++) {
    const last = JSON.parse(s.m['bookeeper.quotes.en']!).order.at(-1);
    expect(nextQuote('en', { storage: s, random: () => 0 }).id).not.toBe(last);
    for (let i = 1; i < n; i++) nextQuote('en', { storage: s, random: () => 0 });
  }
});
it('survives a broken storage', () => {
  const ok = (q: { en: unknown }) => expect(q.en).not.toBeNull();
  const ids = quotesIn('en').map((q) => q.id);
  const bad = [
    { getItem: () => { throw new Error('x'); }, setItem: () => {} },
    { getItem: () => null, setItem: () => { throw new Error('x'); } },
  ];
  for (const s of bad) ok(nextQuote('en', { storage: s }));
  const stored = (v: unknown) => memory({ 'bookeeper.quotes.en': typeof v === 'string' ? v : JSON.stringify(v) });
  for (const v of [
    '{not json',
    'null',
    { order: [...ids.slice(1), 'gone'], next: 0 },
    { order: ids.slice(1), next: 0 },
    { order: ids, next: 999 },
    { order: ids, next: -1 },
    { order: ids, next: 1.5 },
    { order: [...ids.slice(1), ids[1]], next: 0 },
  ]) ok(nextQuote('en', { storage: stored(v), random }));
});
it('works without storage', () => {
  expect(nextQuote('it', { storage: null, random }).it).not.toBeNull();
  expect(nextQuote('it', { random }).it).not.toBeNull();
});
it('keeps one deck per language', () => {
  const s = memory();
  nextQuote('en', { storage: s, random });
  nextQuote('it', { storage: s, random });
  expect(Object.keys(s.m).sort()).toEqual(['bookeeper.quotes.en', 'bookeeper.quotes.it']);
  expect(JSON.parse(s.m['bookeeper.quotes.it']!).order).toHaveLength(80);
  expect(JSON.parse(s.m['bookeeper.quotes.en']!).order).toHaveLength(n);
});
it('picks only entries with a text in the language', () => {
  const s = memory();
  for (let i = 0; i < 100; i++) expect(nextQuote('en', { storage: s, random: Math.random }).en).not.toBeNull();
});
