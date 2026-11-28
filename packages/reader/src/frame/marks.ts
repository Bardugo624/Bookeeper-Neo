import type { HighlightColor } from '../engine/protocol';

/** The little of foliate-js's `Overlayer` that the marks use. */
export interface OverlayerClass {
  highlight(rects: Iterable<DOMRect>, options?: { color?: string }): SVGElement;
  underline(rects: Iterable<DOMRect>, options?: { color?: string; width?: number }): SVGElement;
  outline(rects: Iterable<DOMRect>, options?: { color?: string }): SVGElement;
}

export interface MarkDrawOptions {
  veil: string;
  ink: string;
  hasNote: boolean;
  color: HighlightColor;
}

/** Draws a highlight as the theme's veil; a note adds a line under it. */
export function drawMark(Overlayer: OverlayerClass) {
  return (rects: Iterable<DOMRect>, options: MarkDrawOptions): SVGElement => {
    const group = Overlayer.highlight(rects, { color: options.veil });
    if (!options.hasNote) return group;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.append(group, Overlayer.underline(rects, { color: options.ink, width: 1 }));
    return g;
  };
}

/** `#rrggbb` is dark when its luminance is under half. Anything else counts as light. */
export function isDarkColor(color: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}
