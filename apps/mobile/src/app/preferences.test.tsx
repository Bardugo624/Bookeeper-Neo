import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakePlatform } from '../platform/testing';
import { AppProviders } from './AppProviders';
import { LOCALE_KEY, resetLocalePreferenceForTest, useLocalePreference, useT } from './i18n';
import { resetThemePreferenceForTest, THEME_KEY, useThemePreference } from './theme';

function mockMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  window.matchMedia = vi.fn(
    () =>
      ({
        get matches() {
          return matches;
        },
        addEventListener: (_: string, l: () => void) => listeners.add(l),
        removeEventListener: (_: string, l: () => void) => listeners.delete(l),
      }) as unknown as MediaQueryList,
  );
  return (next: boolean) => {
    matches = next;
    listeners.forEach((l) => l());
  };
}

function Probe() {
  const theme = useThemePreference();
  const locale = useLocalePreference();
  const t = useT();
  return (
    <div>
      <p>{t('mobile.loading')}</p>
      <button onClick={() => theme.set('dark')}>dark</button>
      <button onClick={() => theme.set('light')}>light</button>
      <button onClick={() => locale.set('en')}>en</button>
      <span data-testid="pref">{theme.value + '/' + locale.value}</span>
    </div>
  );
}

function mount() {
  return render(
    <AppProviders platform={fakePlatform()}>
      <Probe />
    </AppProviders>,
  );
}

const isDark = () => document.documentElement.classList.contains('dark');
const original = window.matchMedia;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  resetThemePreferenceForTest();
  resetLocalePreferenceForTest();
});
afterEach(() => {
  window.matchMedia = original;
});

describe('theme preference', () => {
  it('applies the stored preference at start', () => {
    mockMedia(false);
    localStorage.setItem(THEME_KEY, 'dark');
    resetThemePreferenceForTest();
    mount();
    expect(isDark()).toBe(true);
  });

  it('follows the system in system mode', () => {
    const setSystem = mockMedia(false);
    mount();
    expect(isDark()).toBe(false);
    act(() => setSystem(true));
    expect(isDark()).toBe(true);
  });

  it('is not overwritten by the system when explicit', () => {
    const setSystem = mockMedia(false);
    localStorage.setItem(THEME_KEY, 'dark');
    resetThemePreferenceForTest();
    mount();
    act(() => setSystem(false));
    expect(isDark()).toBe(true);
    act(() => setSystem(true));
    expect(isDark()).toBe(true);
  });

  it('changes at once with set and is stored', () => {
    mockMedia(false);
    mount();
    act(() => screen.getByText('dark').click());
    expect(isDark()).toBe(true);
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    act(() => screen.getByText('light').click());
    expect(isDark()).toBe(false);
  });
});

describe('locale preference', () => {
  it('applies the stored preference to the whole app and <html lang>', () => {
    localStorage.setItem(LOCALE_KEY, 'en');
    resetLocalePreferenceForTest();
    mount();
    expect(document.documentElement.lang).toBe('en');
    expect(screen.queryByText('Caricamento…')).toBeNull();
  });

  it('changes without reloading', () => {
    localStorage.setItem(LOCALE_KEY, 'it');
    resetLocalePreferenceForTest();
    mount();
    const before = screen.getByText(/./, { selector: 'p' }).textContent;
    act(() => screen.getByText('en').click());
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByText(/./, { selector: 'p' }).textContent).not.toBe(before);
    expect(localStorage.getItem(LOCALE_KEY)).toBe('en');
  });

  it('follows languagechange in system mode only', () => {
    const lang = vi.spyOn(navigator, 'language', 'get').mockReturnValue('it-IT');
    mount();
    expect(document.documentElement.lang).toBe('it');
    lang.mockReturnValue('en-US');
    act(() => void window.dispatchEvent(new Event('languagechange')));
    expect(document.documentElement.lang).toBe('en');
    act(() => screen.getByText('en').click());
    lang.mockReturnValue('it-IT');
    act(() => void window.dispatchEvent(new Event('languagechange')));
    expect(document.documentElement.lang).toBe('en');
    lang.mockRestore();
  });
});
