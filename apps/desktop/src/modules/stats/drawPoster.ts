import {
  MAX_COVERS,
  POSTER_HEIGHT,
  POSTER_WIDTH,
  coverColor,
  coverInitial,
  type PosterData,
  type PosterLabels,
  type PosterTheme,
} from './posterModel';

/** The part of the 2D context the poster uses: a fake one can stand in for tests. */
export type Ctx = Pick<
  CanvasRenderingContext2D,
  | 'fillRect'
  | 'fillText'
  | 'beginPath'
  | 'roundRect'
  | 'fill'
  | 'save'
  | 'restore'
  | 'measureText'
> & { fillStyle: string | CanvasGradient | CanvasPattern; font: string; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline };

const MARGIN = 90;
const COLS = 6;
const GAP = 24;
const COVER_W = (POSTER_WIDTH - 2 * MARGIN - (COLS - 1) * GAP) / COLS;
const COVER_H = COVER_W * 1.45;

const text = (ctx: Ctx, value: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') => {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
};

function stat(ctx: Ctx, theme: PosterTheme, x: number, y: number, value: string, label: string) {
  text(ctx, value, x, y, `600 120px ${theme.serif}`, theme.accent);
  text(ctx, label, x, y + 48, `400 34px ${theme.sans}`, theme.muted);
}

function fact(ctx: Ctx, theme: PosterTheme, y: number, label: string, value: string) {
  text(ctx, label, MARGIN, y, `400 30px ${theme.sans}`, theme.muted);
  text(ctx, value, MARGIN, y + 50, `600 46px ${theme.serif}`, theme.text);
}

function cover(ctx: Ctx, theme: PosterTheme, c: PosterData['covers'][number], x: number, y: number) {
  ctx.fillStyle = coverColor(c);
  ctx.beginPath();
  ctx.roundRect(x, y, COVER_W, COVER_H, 10);
  ctx.fill();
  ctx.textBaseline = 'middle';
  text(ctx, coverInitial(c.title), x + COVER_W / 2, y + COVER_H / 2, `600 72px ${theme.serif}`, theme.onAccent, 'center');
  ctx.textBaseline = 'alphabetic';
}

/** Draws "Il tuo anno in libri" on a 1080×1350 canvas. Pure: only reads its arguments and calls `ctx`. */
export function drawPoster(ctx: Ctx, data: PosterData, labels: PosterLabels, theme: PosterTheme): void {
  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, 0, POSTER_WIDTH, 16);
  ctx.textBaseline = 'alphabetic';

  text(ctx, String(data.year), MARGIN, 230, `700 190px ${theme.serif}`, theme.text);
  text(ctx, labels.heading, MARGIN, 300, `400 40px ${theme.sans}`, theme.muted);

  stat(ctx, theme, MARGIN, 470, String(data.books), labels.books);
  stat(ctx, theme, POSTER_WIDTH / 2 + 30, 470, String(data.pages), labels.pages);

  if (data.busiestMonth) fact(ctx, theme, 620, labels.busiestMonth, data.busiestMonth);
  if (data.topGenre) fact(ctx, theme, 740, labels.topGenre, data.topGenre);

  const covers = data.covers.slice(0, MAX_COVERS);
  if (covers.length > 0) {
    text(ctx, labels.covers, MARGIN, 880, `400 30px ${theme.sans}`, theme.muted);
    covers.forEach((c, i) => {
      const x = MARGIN + (i % COLS) * (COVER_W + GAP);
      const y = 920 + Math.floor(i / COLS) * (COVER_H + GAP);
      cover(ctx, theme, c, x, y);
    });
  }
  text(ctx, 'Bookeeper', POSTER_WIDTH - MARGIN, POSTER_HEIGHT - 60, `600 30px ${theme.sans}`, theme.muted, 'right');
  ctx.restore();
}
