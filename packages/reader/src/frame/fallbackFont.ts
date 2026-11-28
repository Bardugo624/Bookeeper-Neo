import type { FrameLayout } from '../engine/protocol';
import { FONT_STACKS } from './bookCss';

const GENERIC = new Set(['serif', 'sans-serif', 'times new roman', 'times']);
/** The faces the reader itself puts into every page. */
const OURS = new Set(['lora variable', 'inter variable']);
const MARK = 'data-bk-fallback-font';

const names = (family: string): string[] =>
  family
    .split(',')
    .map((n) => n.trim().replace(/^["']|["']$/g, '').toLowerCase())
    .filter(Boolean);

function hasOwnFace(doc: Document): boolean {
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRule[];
    try {
      rules = Array.from(sheet.cssRules);
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (!rule.cssText.trimStart().startsWith('@font-face')) continue;
      const family = names((rule as CSSStyleRule).style?.getPropertyValue('font-family') ?? /font-family:\s*([^;}]*)/.exec(rule.cssText)?.[1] ?? '');
      if (family.some((n) => !OURS.has(n))) return true;
    }
  }
  return false;
}

/**
 * With the publisher's font and styles on, a page whose `body` names only a generic family and ships no `@font-face`
 * of its own has no face worth keeping: its `body` gets Lora. Safe to call again after each layout change.
 */
export function applyFallbackFont(doc: Document, layout: FrameLayout): void {
  doc.querySelectorAll(`style[${MARK}]`).forEach((el) => el.remove());
  if (layout.font !== 'publisher' || !layout.publisherStyles || !doc.body || !doc.defaultView) return;
  const family = names(doc.defaultView.getComputedStyle(doc.body).fontFamily);
  if (family.length === 0 || !family.every((n) => GENERIC.has(n))) return;
  if (hasOwnFace(doc)) return;
  const style = doc.createElement('style');
  style.setAttribute(MARK, '');
  style.textContent = `body { font-family: ${FONT_STACKS.lora} !important; }`;
  (doc.head ?? doc.documentElement).append(style);
}
