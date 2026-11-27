import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '@bookeeper/i18n';
import quotes from '../quotes.json';
import { LocaleProvider } from './i18n';
import { useQuotes } from './quotes';

const wrapper = (locale: Locale) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <LocaleProvider locale={locale}>{children}</LocaleProvider>;
  };

const byId = new Map((quotes as { id: string; it: string; en: string }[]).map((q) => [q.id, q]));

describe('useQuotes', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each<Locale>(['it', 'en'])('welcome picks only quotes of two lines and up to 110 characters in %s', (locale) => {
    for (let i = 0; i < 40; i += 1) {
      const { result, unmount } = renderHook(() => useQuotes(() => i / 40), { wrapper: wrapper(locale) });
      const text = byId.get(result.current.pick('welcome').id)![locale];
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
    expect(byId.get(ref.id)!.en.length).toBeLessThanOrEqual(110);
  });
});
