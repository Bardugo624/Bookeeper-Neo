import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
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
  const group = useRef<HTMLDivElement>(null);
  const selected = options.some((o) => o.value === value);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step || disabled) return;
    e.preventDefault();
    const at = Math.max(0, options.findIndex((o) => o.value === value));
    const next = options[(at + step + options.length) % options.length];
    onChange(next.value);
    group.current?.querySelectorAll<HTMLButtonElement>('button')[options.indexOf(next)]?.focus();
  };
  return (
    <div ref={group} onKeyDown={onKeyDown} role="radiogroup" aria-label={label} className={cx(styles.segmented, wrap && styles.wrap)} data-disabled={disabled || undefined}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value || (!selected && i === 0) ? 0 : -1}
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
