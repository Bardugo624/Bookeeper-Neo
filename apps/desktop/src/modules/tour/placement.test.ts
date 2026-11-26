import { describe, expect, it } from 'vitest';
import { placeCard } from './placement';

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
