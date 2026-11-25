import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  text?: string;
  /** Optional action, usually a Button. */
  action?: ReactNode;
}

export function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {icon ? (
        <span className={styles.glyph}>
          <Icon name={icon} size={22} />
        </span>
      ) : null}
      <h2 className={styles.title}>{title}</h2>
      {text ? <p className={styles.text}>{text}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
