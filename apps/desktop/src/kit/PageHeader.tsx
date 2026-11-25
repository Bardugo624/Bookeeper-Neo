import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  /** Count line under the title, already translated (e.g. "42 libri"). */
  count?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, count, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.title}>{title}</h1>
        {count !== undefined ? <p className={styles.count}>{count}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
