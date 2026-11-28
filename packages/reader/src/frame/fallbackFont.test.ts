import { afterEach, describe, expect, it } from 'vitest';
import type { FrameLayout } from '../engine/protocol';
import { applyFallbackFont } from './fallbackFont';
import { drawSearchHit, type OverlayerClass } from './marks';

const layout: FrameLayout = {
  colors: { page: '#fff', ink: '#000', link: '#00f', veils: { amber: '#111111', sage: '#222222', terracotta: '#333333', night: '#444444' } },
  font: 'publisher', fontSize: 18, lineHeight: 1.6, margins: 'medium', justify: true, hyphenate: true,
  publisherStyles: true, flow: 'paginated', twoPages: true, animated: false, pdfFit: 'width',
};

let frame: HTMLIFrameElement | null = null;
function page(css: string): Document {
  frame = document.createElement('iframe');
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><style>${css}</style></head><body><p>Testo</p></body></html>`);
  doc.close();
  return doc;
}
afterEach(() => frame?.remove());

describe('the Lora fallback', () => {
  it('a_page_with_only_a_generic_family_gets_lora', () => {
    const doc = page('body { font-family: "Times New Roman", serif; }');
    applyFallbackFont(doc, layout);
    expect(doc.querySelector('style[data-bk-fallback-font]')?.textContent).toContain('Lora Variable');
    // Not with the publisher's styles off or another font chosen: bookCss decides then.
    const other = page('body { font-family: serif; }');
    applyFallbackFont(other, { ...layout, font: 'inter' });
    expect(other.querySelector('style[data-bk-fallback-font]')).toBeNull();
  });

  it('a_page_with_its_own_face_keeps_it', () => {
    const named = page('body { font-family: "Garamond", serif; }');
    applyFallbackFont(named, layout);
    expect(named.querySelector('style[data-bk-fallback-font]')).toBeNull();
    const face = page('@font-face { font-family: "Mine"; src: local("Arial"); } body { font-family: serif; }');
    applyFallbackFont(face, layout);
    expect(face.querySelector('style[data-bk-fallback-font]')).toBeNull();
  });
});

describe('search marks', () => {
  it('only_the_chosen_result_is_outlined', () => {
    const calls: string[] = [];
    const seen: DOMRect[][] = [];
    const Overlayer = {
      highlight: () => document.createElementNS('http://www.w3.org/2000/svg', 'g'),
      underline: () => (calls.push('underline'), document.createElementNS('http://www.w3.org/2000/svg', 'g')),
      outline: (rects: Iterable<DOMRect>) => (calls.push('outline'), seen.push(Array.from(rects)), document.createElementNS('http://www.w3.org/2000/svg', 'g')),
    } as OverlayerClass;
    const rect = { left: 10, top: 20, width: 30, height: 12 } as DOMRect;
    const draw = drawSearchHit(Overlayer, (rects) => rects[0] === rect);
    draw([{ ...rect } as DOMRect]);
    draw([rect]);
    expect(calls).toEqual(['underline', 'outline']);
    expect(seen[0]![0]).toMatchObject({ left: 8, top: 18, width: 34, height: 16 });
  });
});
