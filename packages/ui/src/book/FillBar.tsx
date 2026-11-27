import type { CSSProperties } from 'react';
import { cx } from '../base/cx';
import { clamp01 } from './clamp';
import styles from './FillBar.module.css';

export interface FillBarProps {
  value: number;
  tone?: 'ok' | 'warn' | 'danger' | 'auto';
  label: string;
  /** Spoken value, for when the percentage alone says too little. */
  valueText?: string;
}

export function autoTone(v: number): 'ok' | 'warn' | 'danger' {
  return v >= 0.95 ? 'danger' : v >= 0.75 ? 'warn' : 'ok';
}

export function FillBar({ value, tone = 'auto', label, valueText }: FillBarProps) {
  const v = clamp01(value);
  const resolved = tone === 'auto' ? autoTone(v) : tone;
  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-valuetext={valueText}
      data-tone={resolved}
    >
      <div className={cx(styles.fill, styles[resolved])} style={{ transform: `scaleX(${v})` } as CSSProperties} />
    </div>
  );
}
