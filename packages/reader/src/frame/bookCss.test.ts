import { describe, expect, it } from 'vitest';
import type { FrameLayout } from '../engine/protocol';
import { bookCss } from './bookCss';

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
    expect(out).not.toContain('body *');
    // The book's own font stays; the reader only forces the colors.
    expect(out).not.toContain('Lora');
    expect(out).toMatch(/color: #eeeff0 !important/);
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
});
