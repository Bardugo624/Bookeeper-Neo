import type { ReactNode } from 'react';
import { useId } from 'react';
import { Icon } from './Icon';
import styles from './DangerZone.module.css';

export interface DangerZoneProps {
  /** Already translated by the caller: the kit holds no text. */
  title: string;
  description?: string;
  /** Heading level of the title. */
  headingLevel?: 'h2' | 'h3' | 'h4';
  /** Usually `DangerAction` rows. */
  children?: ReactNode;
}

/** The place for destructive or irreversible operations: red outline, red tint, `alert` icon. */
export function DangerZone({ title, description, headingLevel = 'h3', children }: DangerZoneProps) {
  const titleId = useId();
  const Heading = headingLevel;
  return (
    <section className={styles.zone} aria-labelledby={titleId}>
      <header className={styles.header}>
        <Heading id={titleId} className={styles.title}>
          <Icon name="alert" size={18} />
          <span>{title}</span>
        </Heading>
        {description ? <p className={styles.description}>{description}</p> : null}
      </header>
      {children ? <div className={styles.actions}>{children}</div> : null}
    </section>
  );
}

export interface DangerActionProps {
  title: string;
  /** The consequence, in one sentence. */
  consequence: string;
  /** The command: a `Button variant="danger"` passed by the caller. */
  action: ReactNode;
}

/** One row of a `DangerZone`: what it does, what it costs, and the command on the right. */
export function DangerAction({ title, consequence, action }: DangerActionProps) {
  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <p className={styles.rowTitle}>{title}</p>
        <p className={styles.consequence}>{consequence}</p>
      </div>
      <div className={styles.command}>{action}</div>
    </div>
  );
}
