import type { FontChoice, FrameLayout } from '../engine/protocol';

/** The font stacks. `lora` and `inter` come from `@bookeeper/ui/fonts.css`, which the frame page loads. */
export const FONT_STACKS: Record<Exclude<FontChoice, 'publisher'>, string> = {
  lora: "'Lora Variable', Georgia, serif",
  inter: "'Inter Variable', system-ui, sans-serif",
  serif: 'ui-serif, Georgia, serif',
  sans: 'system-ui, sans-serif',
};

/**
 * The reader's style sheet for the book's pages. With the publisher's styles on, the book keeps its own
 * rules and ours only fill the gaps; with them off, ours win. Colors always win: a dark theme must never
 * show a publisher's dark ink on it. `::selection` is the system's.
 */
export function bookCss(layout: FrameLayout): string {
  const { colors, font, fontSize, lineHeight, justify, hyphenate, publisherStyles } = layout;
  const own = !publisherStyles;
  // The book's own font stays only when asked for and allowed; when it has none, Lora.
  const family = font === 'publisher' ? FONT_STACKS.lora : FONT_STACKS[font];
  const keepBookFont = font === 'publisher' && publisherStyles;
  const hyphens = hyphenate ? 'auto' : 'manual';
  const align = justify ? 'justify' : 'start';

  const rules = [
    `html {
  color: ${colors.ink} !important;
  background: ${colors.page} !important;
  font-size: ${fontSize}px !important;
  -webkit-text-size-adjust: none;
  text-size-adjust: none;
  hyphens: ${hyphens};
  -webkit-hyphens: ${hyphens};
}`,
    `body {
  color: ${colors.ink} !important;
  background: transparent !important;
  line-height: ${lineHeight};
  ${keepBookFont ? '' : `font-family: ${family};`}
  ${justify || own ? `text-align: ${align};` : ''}
}`,
    `a:any-link { color: ${colors.link}; }`,
    `img, svg, video { max-width: 100%; object-fit: contain; }`,
  ];
  if (justify && publisherStyles) rules.push(`p { text-align: ${align}; }`);
  if (own) {
    rules.push(`body *:not(a:any-link) {
  color: inherit !important;
  background: transparent !important;
}
body *:not(img):not(svg):not(video) {
  ${keepBookFont ? '' : `font-family: inherit !important;`}
  line-height: inherit !important;
  text-align: ${align} !important;
  hyphens: ${hyphens} !important;
}
a:any-link { color: ${colors.link} !important; }`);
  }
  return rules.join('\n');
}
