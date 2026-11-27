import { renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { QUOTES } from './data';
import { useOpeningQuote } from './useOpeningQuote';

beforeEach(() => localStorage.clear());

it('keeps the card between renders and takes the next on a new mount', () => {
  const a = renderHook(({ l }) => useOpeningQuote(l), { initialProps: { l: 'it' as const } });
  const first = a.result.current;
  a.rerender({ l: 'it' });
  a.rerender({ l: 'it' });
  expect(a.result.current.id).toBe(first.id);
  a.unmount();
  const b = renderHook(() => useOpeningQuote('it'));
  expect(b.result.current.id).not.toBe(first.id);
});
it('changes card on a language change only when the text is missing', () => {
  const onlyIt = QUOTES.find((q) => q.en === null)!;
  localStorage.setItem(
    'bookeeper.quotes.it',
    JSON.stringify({ order: QUOTES.filter((q) => q.it).map((q) => q.id).sort((x) => (x === onlyIt.id ? -1 : 1)), next: 0 }),
  );
  const h = renderHook(({ l }) => useOpeningQuote(l), { initialProps: { l: 'it' as 'it' | 'en' } });
  expect(h.result.current.id).toBe(onlyIt.id);
  h.rerender({ l: 'en' });
  expect(h.result.current.en).not.toBeNull();
  expect(h.result.current.id).not.toBe(onlyIt.id);
});
