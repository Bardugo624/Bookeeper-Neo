import type { Ctx } from './drawPoster';
import type { PosterLabels, PosterTheme } from './posterModel';

export const THEME: PosterTheme = { background: 'bg', surface: 's', text: 't', muted: 'm', accent: 'a', onAccent: 'o', serif: 'serif', sans: 'sans' };
export const LABELS: PosterLabels = { heading: 'Il tuo 2024 in libri', books: 'libri letti', pages: 'pagine', busiestMonth: 'Mese più intenso', topGenre: 'Genere più letto', covers: 'Alcuni' };

export interface Call {
  fn: string;
  args: unknown[];
  fill?: unknown;
}

/** A 2D context that records every call and the fill colour in force. */
export function fakeCtx() {
  const calls: Call[] = [];
  const state = { fillStyle: '', font: '', textAlign: 'left', textBaseline: 'alphabetic' };
  const ctx = new Proxy(state, {
    get: (target, prop: string) => (prop in target ? target[prop as keyof typeof target] : (...args: unknown[]) => void calls.push({ fn: prop, args, fill: target.fillStyle })),
    set: (target, prop: string, value) => ((target as Record<string, unknown>)[prop] = value, true),
  }) as unknown as Ctx;
  return { ctx, calls };
}

