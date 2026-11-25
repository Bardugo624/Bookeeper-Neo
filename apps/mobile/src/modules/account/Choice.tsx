import { useId } from 'react';
import styles from './Account.module.css';

export interface ChoiceProps<V extends string> {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
}

/** A labelled row of exclusive buttons, each at least 44px tall. */
export function Choice<V extends string>({ label, value, options, onChange }: ChoiceProps<V>) {
  const id = useId();
  return (
    <div className={styles.choice}>
      <span id={id} className={styles.choiceLabel}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className={styles.options}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={styles.option}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
