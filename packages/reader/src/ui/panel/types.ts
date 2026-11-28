import type { HighlightColor } from '../../model/highlightColors';

/** One row of the notes list: a highlight (with a color) or a bookmark. */
export interface NoteEntry {
  id: string;
  kind: 'highlight' | 'bookmark';
  color: HighlightColor | null;
  chapter: string | null;
  /** 0 to 100. */
  percent: number;
  text: string;
  note: string | null;
}

/** One search result, as the engine reports it. */
export interface SearchHit {
  id: string;
  cfi: string;
  fraction: number;
  sectionLabel: string | null;
  pre: string;
  match: string;
  post: string;
}

export type PanelTab = 'toc' | 'notes' | 'search';
export const PANEL_TABS: readonly PanelTab[] = ['toc', 'notes', 'search'];
/** The shortest search the panel runs. */
export const MIN_QUERY = 2;
