import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OVERDUE_ALERTS_KEY, readOverdueAlerts, useOverdueAlerts } from './overdueAlerts';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it('is on by default', () => {
  expect(readOverdueAlerts()).toBe(true);
  expect(renderHook(() => useOverdueAlerts()).result.current[0]).toBe(true);
});

it('saves the choice and reads it back', () => {
  const { result } = renderHook(() => useOverdueAlerts());
  act(() => result.current[1](false));
  expect(result.current[0]).toBe(false);
  expect(localStorage.getItem(OVERDUE_ALERTS_KEY)).toBe('off');
  expect(readOverdueAlerts()).toBe(false);
  act(() => result.current[1](true));
  expect(readOverdueAlerts()).toBe(true);
});

it('shares the value between two components', () => {
  const a = renderHook(() => useOverdueAlerts());
  const b = renderHook(() => useOverdueAlerts());
  act(() => a.result.current[1](false));
  expect(b.result.current[0]).toBe(false);
  act(() => a.result.current[1](true));
});

it('works when the local storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied');
  });
  expect(readOverdueAlerts()).toBe(true);
  const { result } = renderHook(() => useOverdueAlerts());
  act(() => result.current[1](false));
  expect(result.current[0]).toBe(false);
  act(() => result.current[1](true));
});
