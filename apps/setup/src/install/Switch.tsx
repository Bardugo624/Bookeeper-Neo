import { useId, type ReactNode } from 'react';
import { Icon } from '@bookeeper/ui/base';
import styles from './Customize.module.css';

export interface SwitchProps {
  checked: boolean;
  onChange(checked: boolean): void;
  label: ReactNode;
  note?: ReactNode;
}

/** A native checkbox with `role="switch"`, as in the app, drawn as the sketch's box. */
export function Switch({ checked, onChange, label, note }: SwitchProps) {
  const id = useId();
  return (
    <label className={styles.option}>
      <span className={styles.box}>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          aria-labelledby={`${id}-label`}
          aria-describedby={note ? `${id}-note` : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className={styles.tick} aria-hidden="true">
          <Icon name="check" size={12} />
        </span>
      </span>
      <span>
        <span id={`${id}-label`}>{label}</span>
        {note ? (
          <small id={`${id}-note`} className={styles.note}>
            {note}
          </small>
        ) : null}
      </span>
    </label>
  );
}
