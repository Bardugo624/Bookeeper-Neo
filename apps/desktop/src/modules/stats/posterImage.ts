import { drawPoster, type Ctx } from './drawPoster';
import { POSTER_HEIGHT, POSTER_WIDTH, type PosterData, type PosterLabels, type PosterTheme } from './posterModel';

/** Draws the poster on `canvas` once the app fonts are loaded; `false` when there is no 2D context. */
export async function paintPoster(canvas: HTMLCanvasElement, data: PosterData, labels: PosterLabels, theme: PosterTheme): Promise<boolean> {
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  try {
    await document.fonts.ready;
  } catch {
    // Without the font API the system fonts do.
  }
  drawPoster(ctx as Ctx, data, labels, theme);
  return true;
}

/** The PNG of the canvas as bytes. */
export function canvasPng(canvas: HTMLCanvasElement): Uint8Array {
  const url = canvas.toDataURL('image/png');
  const bin = atob(url.slice(url.indexOf(',') + 1));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
