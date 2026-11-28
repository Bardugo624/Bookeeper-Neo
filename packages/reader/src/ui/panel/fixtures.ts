import type { TocItem } from '../../engine/protocol';
import type { NoteEntry, SearchHit } from './types';

export const TOC: TocItem[] = [
  {
    label: 'Capitolo I',
    href: 'c1.xhtml',
    fraction: 0.01,
    children: [{ label: 'Prima parte', href: 'c1.xhtml#a', fraction: 0.02, children: [] }],
  },
  { label: 'Capitolo II', href: 'c2.xhtml', fraction: 0.06, children: [] },
  { label: 'Epilogo', href: 'e.xhtml', fraction: null, children: [] },
];

export const NOTES: NoteEntry[] = [
  { id: 'a', kind: 'highlight', color: 'amber', chapter: 'Capitolo I', percent: 1, text: 'Quel ramo del lago di Como', note: 'Da rileggere.' },
  { id: 'b', kind: 'highlight', color: 'sage', chapter: 'Capitolo I', percent: 2, text: 'il Resegone', note: null },
  { id: 'c', kind: 'bookmark', color: null, chapter: 'Capitolo I', percent: 3, text: 'Per un buon pezzo', note: null },
  { id: 'd', kind: 'highlight', color: 'amber', chapter: 'Capitolo II', percent: 6, text: 'Questo matrimonio non s’ha da fare', note: null },
];

export function hit(n: number, chapter: string | null, fraction = n / 100): SearchHit {
  return { id: `h${n}`, cfi: `cfi${n}`, fraction, sectionLabel: chapter, pre: 'tra due catene di ', match: 'monti', post: `, tutto ${n}` };
}
