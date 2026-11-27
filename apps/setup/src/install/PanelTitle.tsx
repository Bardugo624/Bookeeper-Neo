import { useEffect, useRef, type ReactNode } from 'react';
import styles from './panel.module.css';

/** The panel's title. Focus lands here when the panel appears, so a screen reader starts at the top of what changed. */
export function PanelTitle({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <h1 ref={ref} tabIndex={-1} className={styles.title}>
      {children}
    </h1>
  );
}
