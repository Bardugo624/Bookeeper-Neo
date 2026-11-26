import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { TagSummary } from '@bookeeper/api';
import { Tag } from '@bookeeper/ui/base';
import { colorOf, tagFilterPath } from './tagModel';
import styles from './Tags.module.css';

/** A tag as a label: a dot in its color, the name in a text color. Touching it opens the search. */
export function TagChip({ tag }: { tag: Pick<TagSummary, 'id' | 'name' | 'color'> }) {
  return (
    <Link to={tagFilterPath(tag.id)} className={styles.link} style={{ '--tag-color': colorOf(tag.color) } as CSSProperties}>
      <Tag>
        <span className={styles.dot} aria-hidden="true" />
        {tag.name}
      </Tag>
    </Link>
  );
}
