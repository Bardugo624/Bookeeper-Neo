import { describe, expect, it } from 'vitest';
import { placeBesidePanel, placeCard } from './placement';

const CARD = { width: 300, height: 160 };
const VIEW = { width: 1000, height: 700 };

describe('placeCard', () => {
  it('goes below when there is room, arrow under the target centre', () => {
    const p = placeCard({ x: 100, y: 100, width: 100, height: 40 }, CARD, VIEW);
    expect(p.side).toBe('bottom');
    expect(p.y).toBe(154);
    expect(p.arrow).toBeGreaterThan(0);
  });
  it('goes above at the bottom of the window', () => {
    expect(placeCard({ x: 400, y: 640, width: 100, height: 40 }, CARD, VIEW).side).toBe('right');
    expect(placeCard({ x: 700, y: 640, width: 280, height: 40 }, CARD, VIEW).side).toBe('top');
  });
  it('stays inside the window', () => {
    const p = placeCard({ x: 960, y: 10, width: 30, height: 30 }, CARD, VIEW);
    expect(p.x + CARD.width).toBeLessThanOrEqual(VIEW.width);
  });
  it('docks in a corner without a target', () => {
    expect(placeCard(null, CARD, VIEW)).toMatchObject({ side: 'none', x: 676, y: 516 });
  });
});

describe('placeBesidePanel', () => {
  const panel = { x: 300, y: 100, width: 400, height: 400 };
  const anchor = { x: 320, y: 200, width: 360, height: 40 };
  const overlaps = (p: { x: number; y: number }) =>
    p.x < panel.x + panel.width && p.x + CARD.width > panel.x && p.y < panel.y + panel.height && p.y + CARD.height > panel.y;
  it('goes to the right of the panel, aligned with the anchor, never over it', () => {
    const p = placeBesidePanel(anchor, panel, CARD, { width: 1200, height: 700 });
    expect(p.side).toBe('right');
    expect(p.x).toBe(714);
    expect(overlaps(p)).toBe(false);
  });
  it('goes to the left when the right has no room', () => {
    const p = placeBesidePanel(anchor, { ...panel, x: 600 }, CARD, { width: 1100, height: 700 });
    expect(p.side).toBe('left');
    expect(p.x + CARD.width).toBeLessThanOrEqual(600);
  });
  it('goes above or below a narrow window\'s panel', () => {
    const wide = { x: 20, y: 250, width: 360, height: 300 };
    const p = placeBesidePanel({ x: 30, y: 300, width: 340, height: 40 }, wide, CARD, { width: 400, height: 800 });
    expect(['top', 'bottom']).toContain(p.side);
    expect(p.y + CARD.height <= wide.y || p.y >= wide.y + wide.height).toBe(true);
  });
});
