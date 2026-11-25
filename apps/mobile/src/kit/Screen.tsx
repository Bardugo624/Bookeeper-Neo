import { useId, type ReactNode } from 'react';
import styles from './Screen.module.css';

export interface ScreenProps {
  title: string;
  /** Before the title, e.g. a back button. */
  leading?: ReactNode;
  /** After the title, e.g. an icon button. */
  actions?: ReactNode;
  /** Fixed below the scrolling area, above the tab bar. */
  footer?: ReactNode;
  children: ReactNode;
}

/** One full view: header with the title, a scrolling area, an optional footer. */
export function Screen({ title, leading, actions, footer, children }: ScreenProps) {
  const titleId = useId();
  return (
    <section className={styles.screen} aria-labelledby={titleId}>
      <header className={styles.header}>
        {leading}
        <h1 id={titleId} className={styles.title}>
          {title}
        </h1>
        {actions}
      </header>
      <div className={styles.body}>{children}</div>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </section>
  );
}
