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
  // The wide book dialog's interactive boxes, simulated: group toggles and fields on the right, Save below.
  const interactive = (panel: { x: number; y: number; width: number; height: number }) => [
    { x: panel.x + panel.width - 400, y: panel.y + 200, width: 380, height: 44 },
    { x: panel.x + 224, y: panel.y + 300, width: 500, height: 40 },
    { x: panel.x + panel.width - 90, y: panel.y + panel.height - 56, width: 70, height: 36 },
  ];
  it.each([
    [1280, 800],
    [1024, 768],
  ])('never covers the wide dialog\'s controls at %ix%i', (w, h) => {
    const view = { width: w, height: h };
    const panel = { x: (w - 760) / 2, y: 20, width: 760, height: h - 40 };
    const [, , save] = interactive(panel);
    const p = placeBesidePanel(save, panel, { width: 320, height: 200 }, view);
    if (p.side === 'inline') return; // drawn in the dialog's flow, over nothing
    const cw = p.width ?? 320;
    for (const r of interactive(panel)) {
      const over = p.x < r.x + r.width && p.x + cw > r.x && p.y < r.y + r.height && p.y + 200 > r.y;
      expect(over).toBe(false);
    }
    expect(p.x + cw).toBeLessThanOrEqual(w);
  });
  it('narrows the card to the room beside the panel, and goes inline when even that is not there', () => {
    const wide = { x: 260, y: 20, width: 760, height: 760 };
    const narrow = placeBesidePanel({ x: 926, y: 690, width: 70, height: 36 }, wide, { width: 320, height: 200 }, { width: 1280, height: 800 });
    expect(narrow.side).toBe('right');
    expect(narrow.width).toBeGreaterThanOrEqual(220);
    const tight = { x: 132, y: 20, width: 760, height: 728 };
    expect(placeBesidePanel({ x: 800, y: 690, width: 70, height: 36 }, tight, { width: 320, height: 200 }, { width: 1024, height: 768 }).side).toBe('inline');
  });
});
