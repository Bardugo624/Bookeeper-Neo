import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { TagSummary } from '@bookeeper/api';
import { colorOf } from './tagModel';
import styles from './TagChips.module.css';

export interface TagChipProps {
  tag: Pick<TagSummary, 'name' | 'color'>;
  /** Where touching the tag leads; without it the tag is a plain label. */
  to?: string;
}

/** One tag: a dot and a tinted background in its color, the text in a text token. */
export function TagChip({ tag, to }: TagChipProps) {
  const style = { '--tag-color': colorOf(tag.color) } as CSSProperties;
  const inner = (
    <>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.name}>{tag.name}</span>
    </>
  );
  return to ? (
    <Link to={to} className={styles.chip} style={style}>
      {inner}
    </Link>
  ) : (
    <span className={styles.chip} style={style}>
      {inner}
    </span>
  );
}

export const tagFilterPath = (id: string) => `/books?tag=${encodeURIComponent(id)}`;

export interface TagChipsProps {
  tags: readonly TagSummary[];
  /** Label chips that do not link to the filtered list. */
  plain?: boolean;
  label?: string;
}

/** The tags of a book; touching one opens the list filtered by it. */
export function TagChips({ tags, plain = false, label }: TagChipsProps) {
  if (tags.length === 0) return null;
  return (
    <ul className={styles.list} aria-label={label}>
      {tags.map((tag) => (
        <li key={tag.id}>
          <TagChip tag={tag} to={plain ? undefined : tagFilterPath(tag.id)} />
        </li>
      ))}
    </ul>
  );
}
