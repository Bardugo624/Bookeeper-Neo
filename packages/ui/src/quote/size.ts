import advances from './advances.json';

export type QuoteSize = 33 | 26 | 22 | 20;

const STEPS: readonly QuoteSize[] = [33, 26, 22, 20];
/** Advance of each character in Lora 500, in thousandths of an em (scripts/quote-advances.mjs). */
const ADVANCE: Readonly<Record<string, number>> = advances;
const WIDEST = Math.max(...Object.values(ADVANCE));

const length = (s: string) => [...s].length;

/** Width in em, without kerning; a character Lora lacks counts as the widest. */
function widthEm(s: string): number {
  let units = 0;
  for (const ch of s) units += ADVANCE[ch] ?? WIDEST;
  return units / 1000;
}

/** The opening guillemet hangs 0.5 em into the margin (Quotation.module.css). */
const OPEN = widthEm('«') - 0.5;
const CLOSE = widthEm('»');

/** Font size by length (33 up to 90 characters, 26 up to 140, 22 beyond); verses also have to fit the column, down to 20, or carry on at 22. */
export function quoteSize(text: string, opts: { columnPx: number; compact?: boolean }): QuoteSize {
  if (opts.compact) return 22;
  const n = length(text);
  const byLength: QuoteSize = n <= 90 ? 33 : n <= 140 ? 26 : 22;
  if (!text.includes('\n')) return byLength;
  const verses = text.split('\n');
  const widest = Math.max(
    ...verses.map((verse, i) => widthEm(verse) + (i === 0 ? OPEN : 0) + (i === verses.length - 1 ? CLOSE : 0)),
  );
  return STEPS.find((px) => px <= byLength && widest * px <= opts.columnPx) ?? 22;
}
