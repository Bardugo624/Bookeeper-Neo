import { clothTone } from '@bookeeper/ui/book';

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350;
export const MAX_COVERS = 12;

export interface PosterCover {
  id: string;
  title: string;
  /** Cover colour of the book; absent: a cloth tone drawn from the id. */
  color: string | null;
}

export interface PosterData {
  year: number;
  books: number;
  pages: number;
  busiestMonth: string | null;
  topGenre: string | null;
  covers: PosterCover[];
}

/** Every visible text, already translated. */
export interface PosterLabels {
  heading: string;
  books: string;
  pages: string;
  busiestMonth: string;
  topGenre: string;
  covers: string;
}

/** Colours and fonts of the app, read from its tokens. */
export interface PosterTheme {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  serif: string;
  sans: string;
}

export const coverColor = (c: PosterCover) => c.color ?? clothTone(c.id);
/** First letter of the title, for the placeholder. */
export const coverInitial = (title: string) => Array.from(title.trim())[0]?.toUpperCase() ?? '?';

export const posterFileName = (year: number) => `bookeeper-${year}.png`;

const VARS: Record<keyof PosterTheme, [string, string]> = {
  background: ['--bk-bg', '#ffffff'],
  surface: ['--bk-surface', '#ffffff'],
  text: ['--bk-text-strong', '#000000'],
  muted: ['--bk-text-muted', '#666666'],
  accent: ['--bk-primary-600', '#3b6953'],
  onAccent: ['--bk-on-primary', '#ffffff'],
  serif: ['--bk-font-serif', 'serif'],
  sans: ['--bk-font-ui', 'sans-serif'],
};

/** Reads the tokens in force (light or dark); the second value only covers a missing token. */
export function readPosterTheme(el: Element = document.documentElement): PosterTheme {
  const style = getComputedStyle(el);
  const out = {} as PosterTheme;
  for (const k of Object.keys(VARS) as (keyof PosterTheme)[]) {
    out[k] = style.getPropertyValue(VARS[k][0]).trim() || VARS[k][1];
  }
  return out;
}
