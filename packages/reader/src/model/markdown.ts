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

  const byPercent = (a: ExportItem, b: ExportItem): number => a.percent - b.percent;
  // Book order; each run of the same chapter is one block (a run without a chapter is set off by a rule).
  const highlights = items.filter((i) => i.kind === 'highlight').sort(byPercent);
  let current: string | null | undefined;
  for (const h of highlights) {
    if (h.chapter !== current) {
      current = h.chapter;
      if (h.chapter) blocks.push(`## ${h.chapter}`);
      else if (blocks.length > (meta.author ? 2 : 1)) blocks.push('---');
    }
    blocks.push(
      h.text
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n'),
    );
    if (h.note && h.note.trim()) blocks.push(h.note.replace(/\s+$/, ''));
    blocks.push(`*${pct(h.percent)}${h.color ? ` · ${labels.colors[h.color]}` : ''}*`);
  }

  const bookmarks = items.filter((i) => i.kind === 'bookmark').sort(byPercent);
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
