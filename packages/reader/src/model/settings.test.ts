import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, saveSettings } from './index';

const store = (initial: Record<string, string> = {}) => {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('settings', () => {
  it('defaults_when_storage_is_empty', () => {
    expect(loadSettings(store())).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ theme: 'auto', font: 'publisher', fontSize: 18, lineHeight: 1.6, twoPages: true });
  });

  it('bad_fields_fall_back_one_by_one', () => {
    const s = normalizeSettings({ theme: 'sepia', font: 'comic', lineHeight: 2, justify: 'yes', margins: 'wide', fontSize: 'big' });
    expect(s).toEqual({ ...DEFAULT_SETTINGS, theme: 'sepia', margins: 'wide' });
    expect(loadSettings(store({ 'bookeeper.reader.settings': '{not json' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('font_size_is_clamped_and_rounded', () => {
    expect(normalizeSettings({ fontSize: 40 }).fontSize).toBe(32);
    expect(normalizeSettings({ fontSize: 5 }).fontSize).toBe(12);
    expect(normalizeSettings({ fontSize: 17.6 }).fontSize).toBe(18);
    expect(normalizeSettings({ fontSize: NaN }).fontSize).toBe(18);
  });

  it('saving_survives_a_storage_that_throws', () => {
    const bad = { setItem: () => { throw new Error('full'); } };
    expect(() => saveSettings(bad, DEFAULT_SETTINGS)).not.toThrow();
    const s = store();
    saveSettings(s, { ...DEFAULT_SETTINGS, theme: 'black' });
    expect(loadSettings(s).theme).toBe('black');
  });
});
