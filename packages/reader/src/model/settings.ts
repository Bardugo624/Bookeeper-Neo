import type { FontChoice } from '../engine/protocol';

export type ThemeChoice = 'auto' | 'light' | 'sepia' | 'dark' | 'black';
export type { FontChoice };

export interface ReaderSettings {
  theme: ThemeChoice;
  font: FontChoice;
  fontSize: number;
  lineHeight: 1.4 | 1.6 | 1.8;
  margins: 'narrow' | 'medium' | 'wide';
  flow: 'paginated' | 'scrolled';
  twoPages: boolean;
  justify: boolean;
  hyphenate: boolean;
  publisherStyles: boolean;
  pdfFit: 'width' | 'page';
  panelOpen: boolean;
}

export const SETTINGS_KEY = 'bookeeper.reader.settings';
export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 32;

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'auto',
  font: 'publisher',
  fontSize: 18,
  lineHeight: 1.6,
  margins: 'medium',
  flow: 'paginated',
  twoPages: true,
  justify: true,
  hyphenate: true,
  publisherStyles: true,
  pdfFit: 'width',
  panelOpen: false,
};

const oneOf = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

/** Fixes whatever was stored, field by field: a bad or missing value goes back to the default. */
export function normalizeSettings(raw: unknown): ReaderSettings {
  const d = DEFAULT_SETTINGS;
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const size =
    typeof r.fontSize === 'number' && Number.isFinite(r.fontSize)
      ? Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(r.fontSize)))
      : d.fontSize;
  return {
    theme: oneOf(r.theme, ['auto', 'light', 'sepia', 'dark', 'black'], d.theme),
    font: oneOf(r.font, ['publisher', 'lora', 'inter', 'serif', 'sans'], d.font),
    fontSize: size,
    lineHeight: oneOf(r.lineHeight, [1.4, 1.6, 1.8], d.lineHeight),
    margins: oneOf(r.margins, ['narrow', 'medium', 'wide'], d.margins),
    flow: oneOf(r.flow, ['paginated', 'scrolled'], d.flow),
    twoPages: bool(r.twoPages, d.twoPages),
    justify: bool(r.justify, d.justify),
    hyphenate: bool(r.hyphenate, d.hyphenate),
    publisherStyles: bool(r.publisherStyles, d.publisherStyles),
    pdfFit: oneOf(r.pdfFit, ['width', 'page'], d.pdfFit),
    panelOpen: bool(r.panelOpen, d.panelOpen),
  };
}

export function loadSettings(storage: Pick<Storage, 'getItem'>): ReaderSettings {
  try {
    const text = storage.getItem(SETTINGS_KEY);
    return normalizeSettings(text === null ? null : JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Never throws: a full or blocked storage just means the settings are not kept. */
export function saveSettings(storage: Pick<Storage, 'setItem'>, settings: ReaderSettings): void {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Not kept.
  }
}
