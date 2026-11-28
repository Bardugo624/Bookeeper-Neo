import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../view/cx';
import styles from './Look.module.css';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  /** The full accessible name, when the visible label is an abbreviation. */
  name?: string;
  /** The label is written in its own face (the typeface row). */
  style?: CSSProperties;
  /** Tiles only: drawn above the label, hidden from assistive technology. */
  swatch?: ReactNode;
}

export interface SegmentedProps<T extends string | number> {
  /** Names the row for assistive technology. */
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  wrap?: boolean;
  /** Square tiles with a swatch above the name (the theme row). */
  tiles?: boolean;
}

/** A row of exclusive choices: a radio group drawn as joined buttons. */
export function Segmented<T extends string | number>({ label, value, options, onChange, disabled = false, wrap = false, tiles = false }: SegmentedProps<T>) {
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
    <div ref={group} onKeyDown={onKeyDown} role="radiogroup" aria-label={label} className={cx(tiles ? styles.tiles : styles.segmented, wrap && styles.wrap)} data-disabled={disabled || undefined}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.name}
          tabIndex={o.value === value || (!selected && i === 0) ? 0 : -1}
          disabled={disabled}
          style={o.style}
          className={tiles ? styles.tile : styles.option}
          onClick={() => onChange(o.value)}
        >
          {tiles ? <span className={styles.tileFace} aria-hidden="true">{o.swatch}</span> : null}
          {tiles ? <span className={styles.tileLabel}>{o.label}</span> : o.label}
        </button>
      ))}
    </div>
  );
}
