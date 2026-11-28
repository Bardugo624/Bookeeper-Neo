import type { FrameLayout } from '../engine/protocol';
import { HIGHLIGHT_COLORS, type HighlightColor, type Theme } from './highlightColors';
import { veil } from './highlights';
import type { ReaderSettings } from './settings';
import { THEME_COLORS } from './themeColors';

export function frameLayout(settings: ReaderSettings, theme: Theme, reducedMotion: boolean): FrameLayout {
  const c = THEME_COLORS[theme];
  const veils = Object.fromEntries(HIGHLIGHT_COLORS.map((h) => [h, veil(h, theme)])) as Record<HighlightColor, string>;
  return {
    colors: { page: c.page, ink: c.ink, link: c.accent.text, veils },
    font: settings.font,
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    margins: settings.margins,
    justify: settings.justify,
    hyphenate: settings.hyphenate,
    publisherStyles: settings.publisherStyles,
    flow: settings.flow,
    twoPages: settings.twoPages,
    animated: !reducedMotion,
    pdfFit: settings.pdfFit,
  };
}
