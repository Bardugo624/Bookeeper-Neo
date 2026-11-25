import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { THEME_KEY } from './theme';
import { resetThemeForTest, useTheme } from './useTheme';

let listeners: Array<() => void> = [];
let prefersDark = false;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  listeners = [];
  prefersDark = false;
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return prefersDark;
    },
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: (_: string, cb: () => void) => {
      listeners = listeners.filter((l) => l !== cb);
    },
  }));
  resetThemeForTest();
});
afterEach(() => vi.unstubAllGlobals());

const isDark = () => document.documentElement.classList.contains('dark');

it('system follows matchMedia, live', () => {
  prefersDark = true;
  const { result } = renderHook(() => useTheme());
  expect(result.current.theme).toBe('system');
  expect(isDark()).toBe(true);
  act(() => {
    prefersDark = false;
    listeners.forEach((l) => l());
  });
  expect(isDark()).toBe(false);
});

it('saves the choice and adds then removes the dark class', () => {
  const { result } = renderHook(() => useTheme());
  act(() => result.current.setTheme('dark'));
  expect(isDark()).toBe(true);
  expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  act(() => result.current.setTheme('light'));
  expect(isDark()).toBe(false);
  expect(listeners).toHaveLength(0);
});

it('reapplies the saved choice on a new start', () => {
  localStorage.setItem(THEME_KEY, 'dark');
  resetThemeForTest();
  const { result } = renderHook(() => useTheme());
  expect(result.current.theme).toBe('dark');
  expect(isDark()).toBe(true);
});
