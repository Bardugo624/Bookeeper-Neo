import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LOCALE_KEY,
  LocaleProvider,
  resetLocalePreferenceForTest,
  useLocale,
  useLocalePreference,
  useT,
} from './i18n';

function Probe() {
  const t = useT();
  const locale = useLocale();
  return (
    <p>
      {locale}:{t('common.save')}
    </p>
  );
}

function setSystemLanguage(lang: string) {
  Object.defineProperty(window.navigator, 'language', { value: lang, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  resetLocalePreferenceForTest();
  setSystemLanguage('it-IT');
});
afterEach(() => {
  localStorage.clear();
  resetLocalePreferenceForTest();
  document.documentElement.lang = '';
});

describe('locale preference', () => {
  it('follows the system language by default', () => {
    setSystemLanguage('en-GB');
    render(<LocaleProvider><Probe /></LocaleProvider>);
    expect(screen.getByText('en:Save')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('switches text and <html lang> without remounting', () => {
    const { result } = renderHook(() => useLocalePreference());
    render(<LocaleProvider><Probe /></LocaleProvider>);
    expect(screen.getByText('it:Salva')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('it');
    act(() => result.current.setPreference('en'));
    expect(screen.getByText('en:Save')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LOCALE_KEY)).toBe('en');
  });

  it('survives a new mount', () => {
    const first = renderHook(() => useLocalePreference());
    act(() => first.result.current.setPreference('en'));
    first.unmount();
    resetLocalePreferenceForTest();
    render(<LocaleProvider><Probe /></LocaleProvider>);
    expect(screen.getByText('en:Save')).toBeInTheDocument();
  });

  it('an explicit locale prop wins over the stored choice', () => {
    localStorage.setItem(LOCALE_KEY, 'en');
    resetLocalePreferenceForTest();
    render(<LocaleProvider locale="it"><Probe /></LocaleProvider>);
    expect(screen.getByText('it:Salva')).toBeInTheDocument();
  });

  it('ignores an unknown stored value', () => {
    localStorage.setItem(LOCALE_KEY, 'fr');
    resetLocalePreferenceForTest();
    const { result } = renderHook(() => useLocalePreference());
    expect(result.current.preference).toBe('system');
  });
});
