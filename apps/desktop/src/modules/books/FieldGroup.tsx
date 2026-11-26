import { useId, type ReactNode } from 'react';
import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app';
import styles from './BookSheet.module.css';

export interface FieldGroupProps {
  label: string;
  open: boolean;
  onToggle(open: boolean): void;
  /** Fields with a value: shown beside the name while the group is folded. */
  count: number;
  children: ReactNode;
}

/** A row that opens: a real button with `aria-expanded`, the fields in the region it controls. */
export function FieldGroup({ label, open, onToggle, count, children }: FieldGroupProps) {
  const t = useT();
  const panelId = useId();
  return (
    <section className={styles.group}>
      <button type="button" className={styles.groupToggle} aria-expanded={open} aria-controls={panelId} onClick={() => onToggle(!open)}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} />
        <span className={styles.groupName}>{label}</span>
        {!open && count > 0 ? <span className={styles.groupCount}>{t('books.form.filled', { count })}</span> : null}
      </button>
      <div id={panelId} className={styles.groupBody} hidden={!open}>
        {open ? children : null}
      </div>
    </section>
  );
}
