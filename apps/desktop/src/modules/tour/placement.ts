export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `inline`: no room beside the panel, the card belongs in the dialog's own flow. */
export type Side = 'top' | 'bottom' | 'left' | 'right' | 'none' | 'inline';

export interface Placement {
  side: Side;
  x: number;
  y: number;
  /** Where the arrow sits along the card's edge, from the card's own corner. */
  arrow: number;
  /** Set when the card had to be narrower than asked to fit beside the panel. */
  width?: number;
}

const MARGIN = 12;
const ARROW_INSET = 20;
const MIN_NARROW = 220;
const ORDER: Exclude<Side, 'none' | 'inline'>[] = ['bottom', 'right', 'top', 'left'];

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Inflates a rect on every side. */
export function grow(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by };
}

/** Where the card goes: on the first side of the target with room for it, arrow pointing at the target. */
export function placeCard(target: Rect | null, card: { width: number; height: number }, view: { width: number; height: number }, gap = 14): Placement {
  if (!target) {
    return { side: 'none', x: Math.max(MARGIN, view.width - card.width - 24), y: Math.max(MARGIN, view.height - card.height - 24), arrow: 0 };
  }
  const room: Record<Exclude<Side, 'none' | 'inline'>, number> = {
    bottom: view.height - (target.y + target.height) - gap - MARGIN,
    top: target.y - gap - MARGIN,
    right: view.width - (target.x + target.width) - gap - MARGIN,
    left: target.x - gap - MARGIN,
  };
  const need = { bottom: card.height, top: card.height, right: card.width, left: card.width };
  const side = ORDER.find((s) => room[s] >= need[s]) ?? ORDER.reduce((a, b) => (room[b] > room[a] ? b : a));
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  const maxX = Math.max(MARGIN, view.width - card.width - MARGIN);
  const maxY = Math.max(MARGIN, view.height - card.height - MARGIN);
  let x: number;
  let y: number;
  if (side === 'bottom' || side === 'top') {
    x = clamp(cx - card.width / 2, MARGIN, maxX);
    y = clamp(side === 'bottom' ? target.y + target.height + gap : target.y - gap - card.height, MARGIN, maxY);
  } else {
    y = clamp(cy - card.height / 2, MARGIN, maxY);
    x = clamp(side === 'right' ? target.x + target.width + gap : target.x - gap - card.width, MARGIN, maxX);
  }
  const arrow = side === 'bottom' || side === 'top' ? clamp(cx - x, ARROW_INSET, card.width - ARROW_INSET) : clamp(cy - y, ARROW_INSET, card.height - ARROW_INSET);
  return { side, x, y, arrow };
}

/**
 * Where the card goes when the anchor lives in a dialog: beside the dialog's panel, never over it, so the
 * controls the step asks for stay clickable. Right, then left, aligned with the anchor; above or below when
 * the window is too narrow for either side; against the anchor when no side has room.
 */
export function placeBesidePanel(anchor: Rect, panel: Rect, card: { width: number; height: number }, view: { width: number; height: number }, gap = 14): Placement {
  const room = {
    right: view.width - (panel.x + panel.width) - gap - MARGIN,
    left: panel.x - gap - MARGIN,
    top: panel.y - gap - MARGIN,
    bottom: view.height - (panel.y + panel.height) - gap - MARGIN,
  };
  const fits = (s: keyof typeof room) => room[s] >= (s === 'left' || s === 'right' ? card.width : card.height);
  let side = (['right', 'left', 'top', 'bottom'] as const).find(fits);
  let width: number | undefined;
  if (!side) {
    // A narrower card beside the panel, when that much room is left.
    const narrow = (['right', 'left'] as const).find((s) => room[s] >= MIN_NARROW);
    if (!narrow) return { side: 'inline', x: 0, y: 0, arrow: 0 };
    side = narrow;
    width = Math.floor(room[narrow]);
  }
  const w = width ?? card.width;
  const cx = anchor.x + anchor.width / 2;
  const cy = anchor.y + anchor.height / 2;
  const maxX = Math.max(MARGIN, view.width - w - MARGIN);
  const maxY = Math.max(MARGIN, view.height - card.height - MARGIN);
  if (side === 'left' || side === 'right') {
    const y = clamp(cy - card.height / 2, MARGIN, maxY);
    const x = clamp(side === 'right' ? panel.x + panel.width + gap : panel.x - gap - w, MARGIN, maxX);
    return { side, x, y, arrow: clamp(cy - y, ARROW_INSET, card.height - ARROW_INSET), width };
  }
  const x = clamp(cx - card.width / 2, MARGIN, maxX);
  const y = clamp(side === 'bottom' ? panel.y + panel.height + gap : panel.y - gap - card.height, MARGIN, maxY);
  return { side, x, y, arrow: clamp(cx - x, ARROW_INSET, card.width - ARROW_INSET) };
}
