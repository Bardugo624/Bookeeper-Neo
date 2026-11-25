import type { ReactNode } from 'react';
import styles from './updates.module.css';

const URL_RE = /https?:\/\/[^\s<>"]+/g;
const TRAILING = /[.,;:!?)\]}'"]+$/;

/** Plain text with line breaks kept; only `http` and `https` addresses become links. Nothing is parsed as HTML. */
export function ReleaseNotes({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    const raw = m[0];
    const url = raw.replace(TRAILING, '');
    if (!URL.canParse(url)) continue;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <a key={start} href={url} target="_blank" rel="noopener noreferrer">
        {url}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <div className={styles.notes}>{parts}</div>;
}
