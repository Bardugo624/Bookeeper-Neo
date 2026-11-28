import type { FrameLayout } from '../engine/protocol';
import { bookCss, bookFontBefore } from './bookCss';
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
      const base = sheet.href ?? location.href;
      for (const rule of Array.from(sheet.cssRules)) {
        // The book's pages load from `blob:` URLs, where a root-relative `url()` resolves to nothing.
        if (rule instanceof CSSFontFaceRule) rules.push(absoluteUrls(rule.cssText, base));
      }
    } catch {
      // A sheet from another origin cannot be read; the frame has none.
    }
  }
  return rules.join('\n');
}

/** Rewrites each `url()` of `css` against `base`. */
export function absoluteUrls(css: string, base: string): string {
  return css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g, (all, a, b, c) => {
    const ref = a ?? b ?? c ?? '';
    if (ref.startsWith('data:')) return all;
    try {
      return `url("${new URL(ref, base).href}")`;
    } catch {
      return all;
    }
  });
}

export interface Renderer extends HTMLElement {
  setStyles?: (styles: string | [string, string]) => void;
}

/** One column, or two when the reader asked for them and the frame is wide enough (checked again on each resize). */
export function applyColumns(renderer: HTMLElement, layout: FrameLayout): void {
  const twoColumns = layout.twoPages && window.innerWidth >= TWO_PAGES_MIN_WIDTH;
  renderer.setAttribute('max-column-count', twoColumns ? '2' : '1');
}

/** Gives the renderer the attributes and styles of `layout`. `format` is the extension of the book. */
export function applyLayout(view: HTMLElement, renderer: Renderer, layout: FrameLayout, format: string): void {
  renderer.setAttribute('flow', layout.flow);
  renderer.setAttribute('gap', GAPS[layout.margins]);
  renderer.setAttribute('max-inline-size', `${MAX_COLUMN}px`);
  applyColumns(renderer, layout);
  if (layout.animated) renderer.setAttribute('animated', '');
  else renderer.removeAttribute('animated');
  if (format === 'pdf') renderer.setAttribute('zoom', layout.pdfFit === 'width' ? 'fit-width' : 'fit-page');

  // The veil replaces what is behind the text: `darken` on light pages and `lighten` on dark ones keep the ink
  // exactly as it is and give the page the veil's color, so the contrast the theme promises is the one you get.
  view.style.setProperty('--overlayer-highlight-opacity', '1');
  view.style.setProperty('--overlayer-highlight-blend-mode', isDarkColor(layout.colors.page) ? 'lighten' : 'darken');
  document.documentElement.style.background = layout.colors.page;
  document.body.style.background = layout.colors.page;

  renderer.setStyles?.([`${fontFaceCss()}\n${bookFontBefore(layout)}`, bookCss(layout)]);
}
