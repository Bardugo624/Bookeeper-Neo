import { describe, expect, it } from 'vitest';
import type { FrameLayout } from '../engine/protocol';
import { bookCss, bookFontBefore } from './bookCss';

const layout: FrameLayout = {
  colors: {
    page: '#101112',
    ink: '#eeeff0',
    link: '#a1b2c3',
    veils: { amber: '#111111', sage: '#222222', terracotta: '#333333', night: '#444444' },
  },
  font: 'inter',
  fontSize: 21,
  lineHeight: 1.8,
  margins: 'medium',
  justify: true,
  hyphenate: true,
  publisherStyles: true,
  flow: 'paginated',
  twoPages: true,
  animated: false,
  pdfFit: 'width',
};
const css = (over: Partial<FrameLayout> = {}) => bookCss({ ...layout, ...over });

describe('bookCss', () => {
  it('book_css_follows_the_layout', () => {
    const out = css();
    expect(out).toContain('#101112');
    expect(out).toContain('#eeeff0');
    expect(out).toContain('#a1b2c3');
    expect(out).toContain("'Inter Variable'");
    expect(out).toContain('font-size: 21px');
    expect(out).toContain('line-height: 1.8');
    expect(out).toContain('text-align: justify');
    expect(out).toContain('hyphens: auto');

    const plain = css({ justify: false, hyphenate: false, lineHeight: 1.4, fontSize: 14, font: 'serif' });
    expect(plain).toContain('font-size: 14px');
    expect(plain).toContain('line-height: 1.4');
    expect(plain).toContain('ui-serif');
    expect(plain).toContain('hyphens: manual');
    expect(plain).not.toContain('justify');
  });

  it('with the publisher styles on, the book keeps its own rules', () => {
    const out = css({ font: 'publisher' });
    // Lora sits on `html`, so the book's rules beat it only by naming a font; the body gets no font of ours.
    expect(out).toMatch(/html \{[^}]*font-family: 'Lora Variable'/);
    expect(out).not.toMatch(/body \{[^}]*font-family/);
    expect(out).not.toContain('line-height: inherit');
    expect(out).toMatch(/color: #eeeff0 !important/);
    expect(out).toContain('color: inherit !important');
    expect(bookFontBefore({ ...layout, font: 'publisher' })).toContain('Lora');
    expect(bookFontBefore({ ...layout, font: 'publisher', publisherStyles: false })).toBe('');
  });

  it('with the publisher styles off, the reader forces its own', () => {
    const out = css({ publisherStyles: false, font: 'publisher', justify: false });
    expect(out).toContain('body *');
    expect(out).toContain('line-height: inherit !important');
    expect(out).toContain('text-align: start !important');
    expect(out).toContain('font-family: inherit !important');
    // No font of the book to keep: Lora.
    expect(out).toContain("'Lora Variable'");
  });

  it('never touches ::selection', () => {
    expect(css({ publisherStyles: false })).not.toContain('::selection');
  });

  it('theme_link_color_beats_a_specific_book_rule', () => {
    const out = css({ publisherStyles: true });
    const rule = out.split('\n').find((l) => l.includes('html body a:any-link') && l.includes('!important'));
    expect(rule).toContain('#a1b2c3');
    // Beats a plain book rule such as `a:link { color: #000 }`; an ID selector with !important in the book still wins.
    expect(rule!.match(/:any-link/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('a_chosen_font_reaches_a_book_that_names_its_own', () => {
    for (const publisherStyles of [true, false]) {
      const out = css({ font: 'lora', publisherStyles });
      expect(out).toMatch(/body \{[^}]*font-family: 'Lora Variable', Georgia, serif !important/);
      expect(out).toMatch(/body \*:not\(img\)[^{]*\{\s*font-family: inherit !important/);
    }
  });

  it('monospace_and_images_keep_their_own', () => {
    const out = css({ font: 'sans' });
    const rule = out.match(/(body \*[^{]*:not\(tt\)) \{\s*font-family: inherit !important/)![1];
    for (const t of ['img', 'svg', 'video', 'code', 'pre', 'kbd', 'samp', 'tt']) expect(rule).toContain(`:not(${t})`);
  });

  it('the_publisher_font_is_left_alone', () => {
    const out = css({ font: 'publisher', publisherStyles: true });
    expect(out).not.toMatch(/font-family: [^;]*!important/);
  });
});
