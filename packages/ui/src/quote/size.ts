export type QuoteSize = 33 | 26 | 22 | 20;

const STEPS: readonly QuoteSize[] = [33, 26, 22, 20];
/** Estimated advance of one character, in em. */
const EM_PER_CHAR = 0.55;

const length = (s: string) => [...s].length;

/** Font size by length (33 up to 90 characters, 26 up to 140, 22 beyond); verses also have to fit the column. */
export function quoteSize(text: string, opts: { columnPx: number; compact?: boolean }): QuoteSize {
  if (opts.compact) return 22;
  const n = length(text);
  const byLength: QuoteSize = n <= 90 ? 33 : n <= 140 ? 26 : 22;
  if (!text.includes('\n')) return byLength;
  const longest = Math.max(...text.split('\n').map(length));
  const fit = STEPS.find((px) => px <= byLength && longest * px * EM_PER_CHAR <= opts.columnPx);
  return fit ?? 22;
}
