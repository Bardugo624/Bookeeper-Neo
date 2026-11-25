import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from '@bookeeper/ui/base';
import styles from './ListRow.module.css';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Cover, icon or avatar. */
  leading?: ReactNode;
  /** Replaces the chevron of a navigating row. */
  trailing?: ReactNode;
  /** Makes the row a link. */
  to?: string;
  /** Makes the row a button. */
  onClick?: () => void;
}

/** A tappable list row, at least 56px tall. Without `to` or `onClick` it is plain content. */
export function ListRow({ title, subtitle, leading, trailing, to, onClick }: ListRowProps) {
  const content = (
    <>
      {leading ? <span className={styles.leading}>{leading}</span> : null}
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
      </span>
      {trailing ?? (to || onClick ? <Icon name="chevron-right" size={18} /> : null)}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={styles.row}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={styles.row} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className={styles.row}>{content}</div>;
}
