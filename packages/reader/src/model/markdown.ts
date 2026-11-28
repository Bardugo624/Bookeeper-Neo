import type { HighlightColor } from './highlightColors';

export interface ExportMeta {
  title: string;
  author: string | null;
}
export interface ExportItem {
  kind: 'highlight' | 'bookmark';
  chapter: string | null;
  text: string;
  note: string | null;
  percent: number;
  color: HighlightColor | null;
}
export interface ExportLabels {
  bookmarks: string;
  colors: Record<HighlightColor, string>;
}
export const EXPORT_LABELS: Record<'it' | 'en', ExportLabels> = {
  it: { bookmarks: 'Segnalibri', colors: { amber: 'Ambra', sage: 'Salvia', terracotta: 'Terracotta', night: 'Notte' } },
  en: { bookmarks: 'Bookmarks', colors: { amber: 'Amber', sage: 'Sage', terracotta: 'Terracotta', night: 'Night' } },
};

const SNIPPET_MAX = 140;
const pct = (p: number): string => `${Math.round(p)}%`;

/** Highlights grouped by chapter in book order, then the bookmarks. */
export function exportMarkdown(meta: ExportMeta, items: readonly ExportItem[], labels: ExportLabels): string {
  const blocks: string[] = [`# ${meta.title}`];
  if (meta.author) blocks.push(meta.author);

  const chapters = new Map<string, ExportItem[]>();
  for (const item of items) {
    if (item.kind !== 'highlight') continue;
    const key = item.chapter ?? '';
    const list = chapters.get(key);
    if (list) list.push(item);
    else chapters.set(key, [item]);
  }
  for (const [chapter, list] of chapters) {
    if (chapter) blocks.push(`## ${chapter}`);
    for (const h of list) {
      blocks.push(
        h.text
          .split('\n')
          .map((l) => (l ? `> ${l}` : '>'))
          .join('\n'),
      );
      if (h.note && h.note.trim()) blocks.push(h.note.replace(/\s+$/, ''));
      blocks.push(`*${pct(h.percent)}${h.color ? ` · ${labels.colors[h.color]}` : ''}*`);
    }
  }

  const bookmarks = items.filter((i) => i.kind === 'bookmark');
  if (bookmarks.length) {
    blocks.push(`## ${labels.bookmarks}`);
    blocks.push(
      bookmarks
        .map((b) => {
          const text = b.text.replace(/\s+/g, ' ').trim();
          const snippet = text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX).trimEnd()}…` : text;
          const where = [b.chapter, pct(b.percent)].filter(Boolean).join(' · ');
          return `- ${where}${snippet ? ` — «${snippet}»` : ''}`;
        })
        .join('\n'),
    );
  }
  return blocks.join('\n\n') + '\n';
}

/** «Autore - Titolo - note.md», without the characters a file name cannot have. */
export function markdownFileName(meta: ExportMeta): string {
  const clean = (s: string): string =>
    // eslint-disable-next-line no-control-regex
    s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  const parts = [meta.author ? clean(meta.author) : '', clean(meta.title), 'note'].filter(Boolean);
  return `${parts.join(' - ')}.md`;
}
