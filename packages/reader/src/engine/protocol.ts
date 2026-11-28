// The messages between the reader view and the engine page (`reader-frame.html`). Fixed by the 10B contract.

export type HighlightColor = 'amber' | 'sage' | 'terracotta' | 'night';
export type FontChoice = 'publisher' | 'lora' | 'inter' | 'serif' | 'sans';

export type Target = { cfi: string } | { fraction: number } | { href: string };
/** CSS px, relative to the frame. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface TocItem {
  label: string;
  href: string;
  fraction: number | null;
  children: TocItem[];
}
export interface Relocation {
  cfi: string;
  /** Where the page starts in the whole book, 0 to 1. */
  fraction: number;
  sectionIndex: number;
  sectionFraction: number;
  tocHref: string | null;
  atStart: boolean;
  atEnd: boolean;
}
export interface Mark {
  id: string;
  cfi: string;
  color: HighlightColor;
  hasNote: boolean;
}
export interface FrameLayout {
  colors: { page: string; ink: string; link: string; veils: Record<HighlightColor, string> };
  font: FontChoice;
  fontSize: number;
  lineHeight: 1.4 | 1.6 | 1.8;
  margins: 'narrow' | 'medium' | 'wide';
  justify: boolean;
  hyphenate: boolean;
  publisherStyles: boolean;
  flow: 'paginated' | 'scrolled';
  twoPages: boolean;
  animated: boolean;
  pdfFit: 'width' | 'page';
}

export type ToFrame =
  | { type: 'open'; file: Blob; name: string; at: Target | null; layout: FrameLayout }
  | { type: 'layout'; layout: FrameLayout }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'goto'; target: Target }
  | { type: 'marks'; marks: Mark[] }
  | { type: 'search'; id: number; query: string }
  | { type: 'search-stop' }
  | { type: 'clear-selection' }
  | { type: 'close' };

export type FromFrame =
  | { type: 'ready' }
  | {
      type: 'opened';
      toc: TocItem[];
      /** The start of each section in the book plus the end of the last one: one more entry than sections. */
      sectionFractions: number[];
      /** The size of each section in characters (0 for the sections that are not read). */
      sectionChars: number[];
      format: string;
      title: string | null;
    }
  | { type: 'relocate'; at: Relocation }
  | { type: 'selection'; cfi: string; text: string; rect: Rect }
  | { type: 'selection-cleared' }
  | { type: 'mark-click'; id: string; rect: Rect }
  | { type: 'tap'; zone: 'start' | 'center' | 'end' }
  /** A page turned by a swipe: foliate-js has already moved it, so the app only does what a turn does. */
  | { type: 'swipe'; direction: 'next' | 'prev' }
  | { type: 'key'; key: string; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }
  | {
      type: 'search-result';
      id: number;
      cfi: string;
      fraction: number;
      sectionLabel: string | null;
      pre: string;
      match: string;
      post: string;
    }
  | { type: 'search-progress'; id: number; fraction: number }
  | { type: 'search-done'; id: number }
  | { type: 'closed' }
  | { type: 'error'; code: 'open_failed' | 'unsupported_format' };
