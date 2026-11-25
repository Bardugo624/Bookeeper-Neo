import { describe, expect, it } from 'vitest';
import { drawPoster } from './drawPoster';
import { LABELS, THEME, fakeCtx, type Call } from './fakeCtx';
import { POSTER_HEIGHT, POSTER_WIDTH, type PosterData } from './posterModel';

const cover = (n: number) => ({ id: `b${n}`, title: `Libro ${n}`, color: null });
const data = (over: Partial<PosterData> = {}): PosterData => ({ year: 2024, books: 17, pages: 5123, busiestMonth: 'marzo', topGenre: 'Romanzo', covers: [], ...over });
const texts = (calls: Call[]) => calls.filter((c) => c.fn === 'fillText').map((c) => c.args[0]);

describe('drawPoster', () => {
  it('writes the year, the numbers, the month and the genre', () => {
    const { ctx, calls } = fakeCtx();
    drawPoster(ctx, data(), LABELS, THEME);
    const out = texts(calls);
    expect(out).toEqual(expect.arrayContaining(['2024', '17', '5123', 'marzo', 'Romanzo', 'libri letti', 'pagine']));
    expect(calls[1]).toMatchObject({ fn: 'fillRect', args: [0, 0, POSTER_WIDTH, POSTER_HEIGHT] });
  });

  it('draws at most twelve covers, each with the initial of the title', () => {
    const { ctx, calls } = fakeCtx();
    drawPoster(ctx, data({ covers: Array.from({ length: 20 }, (_, i) => cover(i)) }), LABELS, THEME);
    expect(calls.filter((c) => c.fn === 'roundRect')).toHaveLength(12);
    expect(texts(calls).filter((x) => x === 'L')).toHaveLength(12);
  });

  it('uses the book colour, or a cloth tone when there is none', () => {
    const { ctx, calls } = fakeCtx();
    drawPoster(ctx, data({ covers: [{ id: 'x', title: 'a', color: '#123456' }, cover(2)] }), LABELS, THEME);
    const fills = calls.filter((c) => c.fn === 'fill').map((c) => c.fill);
    expect(fills[0]).toBe('#123456');
    expect(fills[1]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('leaves out what it does not know', () => {
    const { ctx, calls } = fakeCtx();
    drawPoster(ctx, data({ busiestMonth: null, topGenre: null }), LABELS, THEME);
    const out = texts(calls);
    expect(out).not.toContain('Mese più intenso');
    expect(out).not.toContain('Alcuni');
  });
});
