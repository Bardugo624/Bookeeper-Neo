import type { TocItem } from '../engine/protocol';

/** Where the top-level chapters start (0 to 1), sorted and unique, for the marks on the progress bar. */
export function chapterTicks(toc: readonly TocItem[], sectionFractions: readonly number[]): number[] {
  const lo = sectionFractions.length ? sectionFractions[0]! : 0;
  const hi = sectionFractions.length ? sectionFractions[sectionFractions.length - 1]! : 1;
  const set = new Set<number>();
  for (const item of toc) {
    const f = item.fraction;
    if (f === null || !Number.isFinite(f) || f <= lo || f >= hi) continue;
    set.add(f);
  }
  return [...set].sort((a, b) => a - b);
}
