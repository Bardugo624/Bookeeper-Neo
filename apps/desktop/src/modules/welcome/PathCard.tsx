import type { ReactNode } from 'react';
import { Icon, type IconName } from '@bookeeper/ui/base';
import { cx } from '../../shell/cx';
import styles from './PathCard.module.css';

export interface PathCardProps {
  id: string;
  icon: IconName;
  title: string;
  text: string;
  /** Small label next to the title ("Consigliato", "1 trovata in rete"). */
  badge?: ReactNode;
  open: boolean;
  onOpen: () => void;
  children: ReactNode;
}

/** One of the cards of the first screen. Only the open one shows its content. */
export function PathCard({ id, icon, title, text, badge, open, onOpen, children }: PathCardProps) {
  const headerId = `path-${id}-header`;
  const bodyId = `path-${id}-body`;
  return (
    <section className={cx(styles.card, open && styles.open)}>
      <h2 className={styles.heading}>
        <button
          type="button"
          id={headerId}
          data-path-header=""
          className={styles.header}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onOpen}
        >
          <span className={styles.glyph}>
            <Icon name={icon} size={20} />
          </span>
          <span className={styles.titles}>
            <span className={styles.title}>{title}</span>
            <span className={styles.text}>{text}</span>
          </span>
          {badge ? <span className={styles.badge}>{badge}</span> : null}
          {open ? null : <Icon name="chevron-right" size={18} />}
        </button>
      </h2>
      {open ? (
        <div id={bodyId} role="region" aria-labelledby={headerId} className={styles.body}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
