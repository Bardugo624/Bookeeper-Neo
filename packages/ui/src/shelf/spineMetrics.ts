const MIN_PAGES = 80;
const MAX_PAGES = 900;
const MIN_W = 12;
const MAX_W = 34;
const NO_PAGES_W = 20;

/** Spine width in px: 12 up to 80 pages, 34 from 900, linear between; 20 when the page count is unknown. */
export function spineWidth(pages?: number): number {
  if (pages === undefined || Number.isNaN(pages) || pages <= 0) return NO_PAGES_W;
  if (pages <= MIN_PAGES) return MIN_W;
  if (pages >= MAX_PAGES) return MAX_W;
  return MIN_W + ((pages - MIN_PAGES) / (MAX_PAGES - MIN_PAGES)) * (MAX_W - MIN_W);
}

/** Spine height as a percentage (86..100) of the shelf band; the same seed always gives the same height. */
export function spineHeight(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return 86 + (h % 15);
}
