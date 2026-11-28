import type { CSSProperties } from 'react';
import { cx } from '../view/cx';
import styles from './Look.module.css';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  /** The label is written in its own face (the typeface row). */
  style?: CSSProperties;
}

export interface SegmentedProps<T extends string | number> {
  /** Names the row for assistive technology. */
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  wrap?: boolean;
}

/** A row of exclusive choices: a radio group drawn as joined buttons. */
export function Segmented<T extends string | number>({ label, value, options, onChange, disabled = false, wrap = false }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cx(styles.segmented, wrap && styles.wrap)} data-disabled={disabled || undefined}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          style={o.style}
          className={styles.option}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
