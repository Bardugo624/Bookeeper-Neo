import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { THEME_COLORS, type Theme } from '../model';
import { useDocumentTheme } from './useDocumentTheme';

const root = document.documentElement;

afterEach(() => root.removeAttribute('style'));

describe('useDocumentTheme', () => {
  it('reader_sets_and_restores_the_theme_on_the_document', () => {
    root.style.setProperty('--bk-surface-raised', '#123456');
    const { rerender, unmount } = renderHook(({ theme }) => useDocumentTheme(theme), { initialProps: { theme: 'dark' as Theme } });
    expect(root.style.getPropertyValue('--bk-surface-raised')).toBe(THEME_COLORS.dark.raised);
    expect(root.style.getPropertyValue('--rd-page')).toBe(THEME_COLORS.dark.page);
    expect(root.style.getPropertyValue('color-scheme')).toBe('dark');
    rerender({ theme: 'black' });
    expect(root.style.getPropertyValue('--bk-surface-raised')).toBe(THEME_COLORS.black.raised);
    unmount();
    expect(root.style.getPropertyValue('--bk-surface-raised')).toBe('#123456');
    expect(root.style.getPropertyValue('--rd-page')).toBe('');
    expect(root.style.getPropertyValue('color-scheme')).toBe('');
  });

  it('restores_an_important_value_as_important', () => {
    // jsdom keeps the priority only on standard properties, and `color-scheme` is one the hook sets.
    root.style.setProperty('color-scheme', 'light', 'important');
    const { unmount } = renderHook(() => useDocumentTheme('dark'));
    expect(root.style.getPropertyValue('color-scheme')).toBe('dark');
    unmount();
    expect(root.style.getPropertyValue('color-scheme')).toBe('light');
    expect(root.style.getPropertyPriority('color-scheme')).toBe('important');
  });
});
