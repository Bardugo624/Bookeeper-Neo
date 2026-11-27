import { useId, type ReactNode } from 'react';
import styles from './SettingsBlock.module.css';

export interface SettingsBlockProps {
  title: string;
  description?: string;
  /** `full` takes the whole row when cards sit side by side: data, lists, danger zones. */
  span?: 'full';
  children: ReactNode;
}

/** Makes any element of a section (a danger zone, a note) take the whole row. */
export function SettingsFull({ children }: { children: ReactNode }) {
  return <div className={styles.full}>{children}</div>;
}

/** A titled card inside a settings section. */
export function SettingsBlock({ title, description, span, children }: SettingsBlockProps) {
  const id = useId();
  return (
    <section className={span === 'full' ? `${styles.block} ${styles.full}` : styles.block} aria-labelledby={id}>
      <h2 id={id} className={styles.title}>
        {title}
      </h2>
      {description ? <p className={styles.description}>{description}</p> : null}
      <div className={styles.body}>{children}</div>
    </section>
  );
}

export function FactList({ children }: { children: ReactNode }) {
  return <dl className={styles.facts}>{children}</dl>;
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
