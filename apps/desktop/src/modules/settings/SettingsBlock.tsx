import { useId, type ReactNode } from 'react';
import styles from './SettingsBlock.module.css';

export interface SettingsBlockProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** A titled card inside a settings section. */
export function SettingsBlock({ title, description, children }: SettingsBlockProps) {
  const id = useId();
  return (
    <section className={styles.block} aria-labelledby={id}>
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
