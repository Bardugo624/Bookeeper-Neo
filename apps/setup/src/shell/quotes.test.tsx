import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '@bookeeper/i18n';
import { QUOTES, quoteText } from '@bookeeper/ui/quote';
import { LocaleProvider } from './i18n';
import { pool, resolveQuote, useQuotes } from './quotes';

const wrapper = (locale: Locale) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <LocaleProvider locale={locale}>{children}</LocaleProvider>;
  };

const textOf = (id: string, locale: Locale) => quoteText(id, locale)!.text;

describe('groups', () => {
  it('has no entry without a text in the language', () => {
    for (const kind of ['welcome', 'progress', 'farewell'] as const) {
      expect(pool(kind, 'en').every((q) => q.en !== null)).toBe(true);
      expect(pool(kind, 'it').every((q) => q.it !== null)).toBe(true);
    }
  });

  it.each([
    ['it', 34, 69],
    ['en', 21, 44],
  ] as const)('counts the entries in %s', (locale, compact, progress) => {
    expect(pool('welcome', locale)).toHaveLength(compact);
    expect(pool('farewell', locale)).toHaveLength(compact);
    expect(pool('progress', locale)).toHaveLength(progress);
  });

  it('keeps every entry within its limits', () => {
    for (const locale of ['it', 'en'] as const) {
      for (const kind of ['welcome', 'farewell'] as const) {
        for (const q of pool(kind, locale)) {
          const text = q[locale]!.text;
          expect(text.length).toBeLessThanOrEqual(110);
          expect(text.split('\n').length).toBeLessThanOrEqual(2);
        }
      }
      for (const q of pool('progress', locale)) expect(q[locale]!.text.length).toBeLessThanOrEqual(200);
    }
  });
});

describe('resolveQuote', () => {
  it('is null for a quote without an English text', () => {
    const id = QUOTES.find((q) => q.en === null)?.id;
    expect(id).toBeDefined();
    expect(resolveQuote({ id: id! }, 'en')).toBeNull();
    expect(resolveQuote({ id: id! }, 'it')).not.toBeNull();
  });
});

describe('useQuotes', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each<Locale>(['it', 'en'])('welcome picks only quotes of two lines and up to 110 characters in %s', (locale) => {
    for (let i = 0; i < 40; i += 1) {
      const { result, unmount } = renderHook(() => useQuotes(() => i / 40), { wrapper: wrapper(locale) });
      const text = textOf(result.current.pick('welcome').id, locale);
      expect(text.length).toBeLessThanOrEqual(110);
      expect(text.split('\n').length).toBeLessThanOrEqual(2);
      unmount();
    }
  });

  it('keeps the welcome quote across calls', () => {
    const { result } = renderHook(() => useQuotes(), { wrapper: wrapper('it') });
    const first = result.current.pick('welcome');
    expect(result.current.pick('welcome')).toEqual(first);
  });

  it('never repeats the quote in view', () => {
    const { result } = renderHook(() => useQuotes(() => 0), { wrapper: wrapper('it') });
    let shown = result.current.pick('welcome');
    for (let i = 0; i < 6; i += 1) {
      act(() => vi.advanceTimersByTime(6000));
      const next = result.current.pick('progress');
      expect(next.id).not.toBe(shown.id);
      shown = next;
    }
  });

  it('changes at the start of the work, then at most every 6 seconds', () => {
    const { result } = renderHook(() => useQuotes(), { wrapper: wrapper('it') });
    const welcome = result.current.pick('welcome');
    const first = result.current.pick('progress');
    expect(first.id).not.toBe(welcome.id);

    act(() => vi.advanceTimersByTime(5900));
    expect(result.current.pick('progress')).toEqual(first);

    act(() => vi.advanceTimersByTime(200));
    expect(result.current.pick('progress').id).not.toBe(first.id);
  });

  it('farewell takes quotes that fit the compact frontispiece', () => {
    const { result } = renderHook(() => useQuotes(), { wrapper: wrapper('en') });
    const ref = result.current.pick('farewell');
    expect(textOf(ref.id, 'en').length).toBeLessThanOrEqual(110);
  });
});
