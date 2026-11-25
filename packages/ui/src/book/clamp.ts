/** Clamps to 0..1; NaN becomes 0. */
export function clamp01(n: number): number {
  return Number.isNaN(n) ? 0 : Math.min(1, Math.max(0, n));
}
