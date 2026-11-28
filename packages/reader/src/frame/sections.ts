/** Where each section of a book starts, from the sizes foliate-js gives them (the same sum it uses for progress). */
export class SectionMap {
  readonly sizes: number[];
  /** The start of each section plus the end of the last: `sizes.length + 1` entries, from 0 to 1. */
  readonly fractions: number[];
  readonly total: number;

  constructor(sizes: number[]) {
    this.sizes = sizes.map((s) => (Number.isFinite(s) && s > 0 ? s : 0));
    this.total = this.sizes.reduce((a, b) => a + b, 0);
    const out = [0];
    let sum = 0;
    for (const size of this.sizes) out.push(this.total > 0 ? (sum += size) / this.total : 0);
    this.fractions = out;
  }

  /** The place in the whole book of a point inside a section, 0 to 1. */
  fractionOf(index: number, inSection: number): number {
    if (this.total <= 0) return 0;
    const start = this.fractions[Math.min(Math.max(index, 0), this.sizes.length)] ?? 0;
    const size = this.sizes[index] ?? 0;
    return clamp(start + clamp(inSection) * (size / this.total));
  }

  /** The inverse of `fractionOf`: the section and the place inside it. */
  locate(fraction: number): { index: number; anchor: number } {
    const last = Math.max(this.sizes.length - 1, 0);
    if (this.total <= 0 || fraction <= 0) return { index: this.firstRead(), anchor: 0 };
    if (fraction >= 1) return { index: this.lastRead(last), anchor: 1 };
    let index = this.fractions.findIndex((x) => x > fraction) - 1;
    if (index < 0) return { index: this.firstRead(), anchor: 0 };
    while (index < last && !this.sizes[index]) index++;
    const size = (this.sizes[index] ?? 0) / this.total;
    const anchor = size > 0 ? (fraction - (this.fractions[index] ?? 0)) / size : 0;
    return { index, anchor: clamp(anchor) };
  }

  private firstRead(): number {
    return Math.max(
      this.sizes.findIndex((s) => s > 0),
      0,
    );
  }
  private lastRead(fallback: number): number {
    for (let i = this.sizes.length - 1; i >= 0; i--) if (this.sizes[i]) return i;
    return fallback;
  }
}

const clamp = (x: number): number => (Number.isFinite(x) ? Math.min(Math.max(x, 0), 1) : 0);
