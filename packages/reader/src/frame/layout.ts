import type { FrameLayout } from '../engine/protocol';
import { bookCss } from './bookCss';
import { isDarkColor } from './marks';

const GAPS: Record<FrameLayout['margins'], string> = { narrow: '4%', medium: '7%', wide: '10%' };
/** The column is at most this wide, in CSS px. */
export const MAX_COLUMN = 720;
/** Two columns need a page at least this wide. */
export const TWO_PAGES_MIN_WIDTH = 1000;

/** The `@font-face` rules of the frame page, to copy into each page of the book (it is a document of its own). */
export function fontFaceCss(): string {
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) if (rule instanceof CSSFontFaceRule) rules.push(rule.cssText);
    } catch {
      // A sheet from another origin cannot be read; the frame has none.
    }
  }
  return rules.join('\n');
}

export interface Renderer extends HTMLElement {
  setStyles?: (styles: string | [string, string]) => void;
}

/** Gives the renderer the attributes and styles of `layout`. `format` is the extension of the book. */
export function applyLayout(view: HTMLElement, renderer: Renderer, layout: FrameLayout, format: string): void {
  const twoColumns = layout.twoPages && window.innerWidth >= TWO_PAGES_MIN_WIDTH;
  renderer.setAttribute('flow', layout.flow);
  renderer.setAttribute('gap', GAPS[layout.margins]);
  renderer.setAttribute('max-inline-size', `${MAX_COLUMN}px`);
  renderer.setAttribute('max-column-count', twoColumns ? '2' : '1');
  if (layout.animated) renderer.setAttribute('animated', '');
  else renderer.removeAttribute('animated');
  if (format === 'pdf') renderer.setAttribute('zoom', layout.pdfFit === 'width' ? 'fit-width' : 'fit-page');

  // The veil replaces what is behind the text: `darken` on light pages and `lighten` on dark ones keep the ink
  // exactly as it is and give the page the veil's color, so the contrast the theme promises is the one you get.
  view.style.setProperty('--overlayer-highlight-opacity', '1');
  view.style.setProperty('--overlayer-highlight-blend-mode', isDarkColor(layout.colors.page) ? 'lighten' : 'darken');
  document.documentElement.style.background = layout.colors.page;
  document.body.style.background = layout.colors.page;

  renderer.setStyles?.([fontFaceCss(), bookCss(layout)]);
}
