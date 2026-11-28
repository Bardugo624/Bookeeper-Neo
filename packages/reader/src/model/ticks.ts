import type { TocItem } from '../engine/protocol';

/** The most marks the progress bar carries. */
export const MAX_TICKS = 40;

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
  const sorted = [...set].sort((a, b) => a - b);
  // At most MAX_TICKS: a tick stays only if it is at least 1/MAX_TICKS of the bar past the last kept one.
  const kept: number[] = [];
  for (const f of sorted) {
    if (kept.length === 0 || f - kept[kept.length - 1]! >= 1 / MAX_TICKS - 1e-9) kept.push(f);
  }
  return kept.slice(0, MAX_TICKS);
}
